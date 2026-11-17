import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHub, buildCategory, buildUser, buildSetting, entityKey, MasterInputError, ROLES } from '../lib/mastersWrite.js';

const bad = (fn, re) => assert.throws(fn, (e) => e instanceof MasterInputError && re.test(e.message));

test('hub: required fields, cluster lead optional, active by default', () => {
  const row = buildHub({ hub_name: '  Chattogram   Central ', zone: 'ISD', division: 'Chattogram', regional_lead: 'A B', cluster_lead: '' });
  assert.deepEqual(row, { hub_name: 'Chattogram Central', zone: 'ISD', division: 'Chattogram', regional_lead: 'A B', cluster_lead: null, is_active: true });
  bad(() => buildHub({ hub_name: '', zone: 'ISD', division: 'x', regional_lead: 'y' }), /Hub name is required/);
  bad(() => buildHub({ hub_name: 'H', zone: 'XYZ', division: 'x', regional_lead: 'y' }), /zone/);
  bad(() => buildHub({ hub_name: 'H', zone: 'ISD', division: '', regional_lead: 'y' }), /Division is required/);
  bad(() => buildHub({ hub_name: 'H', zone: 'ISD', division: 'x', regional_lead: '' }), /Regional lead is required/);
});

test('category: side and issue type checked; None becomes null; SLA days 1-10 or blank', () => {
  const row = buildCategory({ category: 'Pickup Issue', sub_category: 'Late pickup', side: 'ops', issue_type: '', sla_isd: '3', sla_osd: '', sla_ctg: '10' });
  assert.deepEqual(row, { category: 'Pickup Issue', sub_category: 'Late pickup', side: 'ops', issue_type: null, sla_isd: 3, sla_osd: null, sla_ctg: 10, is_active: true });
  bad(() => buildCategory({ category: 'a', sub_category: 'b', side: 'admin' }), /Side/);
  bad(() => buildCategory({ category: 'a', sub_category: 'b', side: 'ops', issue_type: 'Huge' }), /Issue type/);
  bad(() => buildCategory({ category: 'a', sub_category: 'b', sla_isd: '0' }), /SLA days for ISD/);
  bad(() => buildCategory({ category: 'a', sub_category: 'b', sla_osd: '11' }), /SLA days for OSD/);
  bad(() => buildCategory({ category: 'a', sub_category: 'b', sla_ctg: '2.5' }), /SLA days for CTG/);
  bad(() => buildCategory({ category: '', sub_category: 'b' }), /Issue category is required/);
});

test('user: email lower-cased and checked; role must be a real role; teams split and de-duplicated', () => {
  const row = buildUser({ display_name: 'Asif', email: ' Asif.Rashid@CarryBee.com ', role: 'cm_lead', teams: 'CM, KAM, CM,', zone: '' });
  assert.deepEqual(row, { email: 'asif.rashid@carrybee.com', display_name: 'Asif', role: 'cm_lead', teams: ['CM', 'KAM'], zone: null, region: null, is_active: true });
  bad(() => buildUser({ display_name: 'x', email: 'not-an-email', role: 'admin' }), /Email does not look valid/);
  bad(() => buildUser({ display_name: 'x', email: 'a@b.com', role: 'root' }), /valid role/);
  bad(() => buildUser({ display_name: 'x', email: 'a@b.com', role: 'admin', zone: 'XYZ' }), /Zone/);
});

test('every role in the form is allowed by the database constraint list', () => {
  const dbRoles = ['requester', 'hub_ops', 'regional_lead', 'admin', 'management', 'team_lead', 'cm_lead', 'cm_member', 'mx'];
  assert.deepEqual([...ROLES].sort(), [...dbRoles].sort());
});

test('setting: key format, JSON value when valid, plain text otherwise', () => {
  assert.deepEqual(buildSetting({ key: 'pick_hours', value: '4', description: '' }), { key: 'pick_hours', value: 4, description: null });
  assert.deepEqual(buildSetting({ key: 'label', value: '{"hours": 4}', description: 'x' }), { key: 'label', value: { hours: 4 }, description: 'x' });
  assert.deepEqual(buildSetting({ key: 'note', value: 'hello there' }), { key: 'note', value: 'hello there', description: null });
  bad(() => buildSetting({ key: 'Pick Hours', value: '4' }), /Setting key/);
  bad(() => buildSetting({ key: '1abc', value: '4' }), /Setting key/);
  bad(() => buildSetting({ key: 'ok_key', value: '   ' }), /Value is required/);
});

test('audit key for each entity', () => {
  assert.equal(entityKey('hub', { hub_name: 'H' }), 'H');
  assert.equal(entityKey('category', { category: 'C', sub_category: 'S', side: 'ops' }), 'C / S / ops');
  assert.equal(entityKey('user', { email: 'a@b.com' }), 'a@b.com');
  assert.equal(entityKey('setting', { key: 'k' }), 'k');
});
