// KAM Status for IR issues: who may set it, and the allowed values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IR_KAM_STATUSES, canSetIrKamStatus, kamStatusError } from '../lib/irKamStatus.mjs';

const esc = { issue_id: 'CB-25-11-AAAA', email: 'kam1@carrybee.com', route_ir: true };
const users = [
  { email: 'kam1@carrybee.com', role: 'requester', teams: ['Dhaka-1'] },
  { email: 'kam2@carrybee.com', role: 'requester', teams: ['Dhaka-2'] },
  { email: 'lead1@carrybee.com', role: 'team_lead', teams: ['Dhaka-1'] },
  { email: 'lead2@carrybee.com', role: 'team_lead', teams: ['Dhaka-2'] },
];

test('the three KAM Status values', () => {
  assert.deepEqual(IR_KAM_STATUSES, ['Open', 'Waiting for IR', 'Resolved by KAM']);
  assert.equal(kamStatusError('Waiting for IR'), null);
  assert.match(kamStatusError('Closed'), /must be one of/);
});

test('the KAM who raised the issue can set it', () => {
  assert.equal(canSetIrKamStatus({ email: 'kam1@carrybee.com', role: 'requester', teams: ['Dhaka-1'] }, esc, users), true);
  assert.equal(canSetIrKamStatus({ email: 'KAM1@carrybee.com', role: 'requester', teams: [] }, esc, users), true, 'email match ignores case');
});

test('the team lead of the raiser can set it; a lead of another team cannot', () => {
  assert.equal(canSetIrKamStatus({ email: 'lead1@carrybee.com', role: 'team_lead', teams: ['Dhaka-1'] }, esc, users), true);
  assert.equal(canSetIrKamStatus({ email: 'lead2@carrybee.com', role: 'team_lead', teams: ['Dhaka-2'] }, esc, users), false);
});

test('admin can set it', () => {
  assert.equal(canSetIrKamStatus({ email: 'admin@carrybee.com', role: 'admin', teams: [] }, esc, users), true);
});

test('another KAM on a different team cannot set it', () => {
  assert.equal(canSetIrKamStatus({ email: 'kam2@carrybee.com', role: 'requester', teams: ['Dhaka-2'] }, esc, users), false);
});

test('a team lead on the same team but a missing raiser row is refused', () => {
  assert.equal(canSetIrKamStatus({ email: 'lead1@carrybee.com', role: 'team_lead', teams: ['Dhaka-1'] }, esc, []), false);
  assert.equal(canSetIrKamStatus(null, esc, users), false);
});
