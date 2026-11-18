import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditOps, canPick } from '../lib/roles.js';
import { isHubRole } from '../lib/hubPolicy.js';

const hub = { email: 'hub@carrybee.com', role: 'hub_ops', zone: 'ISD' };
const admin = { email: 'a@carrybee.com', role: 'admin' };
const esc = { email: 'kam@carrybee.com', zone: 'ISD', issue_pick_time: null, division: 'Dhaka' };
const cmIssue = { ...esc, channel: 'MX', kam_name: 'CM', cm_assigned: true, cm_owner_email: 'cm@x', business_pick_time: null };

test('hub_ops cannot edit ops fields or pick, even in their own zone', () => {
  assert.equal(canEditOps(hub, esc), false);
  assert.equal(canPick(hub, esc), false);
});

test('admin keeps ops edit; CM picked applies only to CM-assigned issues', () => {
  assert.equal(canEditOps(admin, esc), true);
  assert.equal(canPick(admin, esc), false); // normal issue: picked at raise, no CM pick button
  assert.equal(canPick(admin, cmIssue), true);
});

test('CM picked button: only CM members, CM leads and admin, only on unpicked CM-assigned issues', () => {
  assert.equal(canPick({ role: 'cm_member', email: 'cm@x' }, cmIssue), true);
  assert.equal(canPick({ role: 'cm_lead', email: 'cml@x' }, cmIssue), true);
  assert.equal(canPick({ role: 'mx', email: 'mx@x' }, cmIssue), false);
  assert.equal(canPick({ role: 'requester', email: 'r@x' }, cmIssue), false);
  assert.equal(canPick({ role: 'cm_member', email: 'cm@x' }, { ...cmIssue, business_pick_time: '2026-11-18T09:00:00Z' }), false);
});

test('hub role detection is server-side policy', () => {
  assert.equal(isHubRole('hub_ops'), true);
  assert.equal(isHubRole('cm_lead'), false);
  assert.equal(isHubRole(null), false);
});
