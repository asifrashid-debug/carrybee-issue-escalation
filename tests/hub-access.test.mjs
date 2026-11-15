import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditOps, canPick } from '../lib/roles.js';
import { isHubRole } from '../lib/hubPolicy.js';

const hub = { email: 'hub@carrybee.com', role: 'hub_ops', zone: 'ISD' };
const admin = { email: 'a@carrybee.com', role: 'admin' };
const esc = { email: 'kam@carrybee.com', zone: 'ISD', issue_pick_time: null, division: 'Dhaka' };

test('hub_ops cannot edit ops fields or pick, even in their own zone', () => {
  assert.equal(canEditOps(hub, esc), false);
  assert.equal(canPick(hub, esc), false);
});

test('admin keeps ops edit and pick', () => {
  assert.equal(canEditOps(admin, esc), true);
  assert.equal(canPick(admin, esc), true);
});

test('hub role detection is server-side policy', () => {
  assert.equal(isHubRole('hub_ops'), true);
  assert.equal(isHubRole('cm_lead'), false);
  assert.equal(isHubRole(null), false);
});
