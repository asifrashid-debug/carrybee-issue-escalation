import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabsFor, canOpenTab, tabForPath, navFor } from '../lib/access.js';

const ALL = ['overview','analytics','tracker','hubs','teams','kam_form','mx_form','admin','sync'];

test('super admin sees every tab', () => {
  assert.deepEqual([...tabsFor('admin')].sort(), [...ALL].sort());
});

test('team lead and CM lead: Overview, Analytics, Tracker, HUB, Team Performance, KAM Form', () => {
  const want = ['overview','analytics','tracker','hubs','teams','kam_form'].sort();
  assert.deepEqual([...tabsFor('team_lead')].sort(), want);
  assert.deepEqual([...tabsFor('cm_lead')].sort(), want);
});

test('KAM and CM members: Tracker, Team Performance, KAM Form', () => {
  for (const r of ['requester', 'cm_member']) assert.deepEqual([...tabsFor(r)].sort(), ['kam_form','teams','tracker']);
});

test('MX members: Tracker, Team Performance, MX Form', () => {
  assert.deepEqual([...tabsFor('mx')].sort(), ['mx_form','teams','tracker']);
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
  assert.equal(tabForPath('/mx/new'), 'mx_form');
  assert.equal(tabForPath('/admin'), 'admin');
  assert.equal(tabForPath('/sync'), 'sync');
  assert.equal(tabForPath('/unknown'), null);
});

test('nav is filtered by role', () => {
  assert.deepEqual(navFor('mx').map((t) => t.tab).sort(), ['mx_form','teams','tracker']);
  assert.equal(navFor('admin').length, 9);
});
