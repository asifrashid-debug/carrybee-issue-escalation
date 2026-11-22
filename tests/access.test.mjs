import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabsFor, canOpenTab, tabForPath, navFor } from '../lib/access.js';

const ALL = ['overview','analytics','tracker','hubs','teams','kam_form','kam_issues','mx_form','admin','sync'];

test('super admin sees every tab', () => {
  assert.deepEqual([...tabsFor('admin')].sort(), [...ALL].sort());
});

test('CM lead: Overview, Analytics, Tracker, HUB, Team Performance, KAM Form', () => {
  assert.deepEqual([...tabsFor('cm_lead')].sort(), ['overview','analytics','tracker','hubs','teams','kam_form'].sort());
});

test('team lead: the CM lead tabs plus KAM Feedback', () => {
  assert.deepEqual([...tabsFor('team_lead')].sort(), ['overview','analytics','tracker','hubs','teams','kam_form','kam_issues'].sort());
});

test('CM members: Tracker, Team Performance, KAM Form (no KAM Feedback)', () => {
  assert.deepEqual([...tabsFor('cm_member')].sort(), ['kam_form','teams','tracker']);
});

test('KAM (requester): Tracker, Team Performance, KAM Form, KAM Feedback', () => {
  assert.deepEqual([...tabsFor('requester')].sort(), ['kam_form','kam_issues','teams','tracker']);
});

test('MX members: Tracker, Team Performance, MX Form, KAM Feedback', () => {
  assert.deepEqual([...tabsFor('mx')].sort(), ['kam_issues','mx_form','teams','tracker']);
});

test('management, regional leads and hub ops have no tracker tabs (hub responses come from the hub response sheet)', () => {
  for (const r of ['management','regional_lead','hub_ops']) {
    assert.deepEqual(tabsFor(r), []);
    assert.equal(navFor(r).length, 0);
    assert.equal(canOpenTab(r, 'tracker'), false);
  }
});

test('unknown or missing role sees nothing', () => {
  assert.deepEqual(tabsFor(undefined), []);
  assert.equal(canOpenTab('mx', 'kam_form'), false);
  assert.equal(canOpenTab('requester', 'mx_form'), false);
  assert.equal(canOpenTab('cm_member', 'admin'), false);
});

test('page paths map to tabs', () => {
  assert.equal(tabForPath('/'), 'tracker');
  assert.equal(tabForPath('/dashboard'), 'overview');
  assert.equal(tabForPath('/kam/new'), 'kam_form');
  assert.equal(tabForPath('/kam/issues'), 'kam_issues');
  assert.equal(tabForPath('/mx/new'), 'mx_form');
  assert.equal(tabForPath('/admin'), 'admin');
  assert.equal(tabForPath('/sync'), 'sync');
  assert.equal(tabForPath('/unknown'), null);
});

test('nav is filtered by role', () => {
  assert.deepEqual(navFor('mx').map((t) => t.tab).sort(), ['kam_issues','mx_form','teams','tracker']);
  assert.equal(navFor('admin').length, 10);
});
