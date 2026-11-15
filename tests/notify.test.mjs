import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyRecipients, hubNotice } from '../lib/notify.js';

const users = [
  { email: 'raiser@cb.com', role: 'requester', teams: ['KAM A'] },
  { email: 'lead-a@cb.com', role: 'team_lead', teams: ['KAM A'] },
  { email: 'lead-b@cb.com', role: 'team_lead', teams: ['IB'] },
];

test('recipients: raiser plus leads of the raiser teams only', () => {
  const esc = { issue_id: 'CB-15-11-AAAA', email: 'raiser@cb.com' };
  const got = notifyRecipients(esc, users[0], users).sort();
  assert.deepEqual(got, ['lead-a@cb.com', 'raiser@cb.com']);
});

test('recipients: no duplicate when raiser is also a lead', () => {
  const lead = { email: 'lead@cb.com', role: 'team_lead', teams: ['KAM A'] };
  const got = notifyRecipients({ email: 'lead@cb.com' }, lead, [lead]);
  assert.deepEqual(got, ['lead@cb.com']);
});

test('notice: only tracked hub fields notify, empty values do not', () => {
  const esc = { issue_id: 'CB-15-11-AAAA' };
  assert.ok(hubNotice('layer1_response', 'Driver called', esc));
  assert.equal(hubNotice('layer1_response', '   ', esc), null);
  assert.equal(hubNotice('remarks', 'x', esc), null);
});

test('notice: long text is shortened to 160 characters', () => {
  const n = hubNotice('layer2_response', 'a'.repeat(400), { issue_id: 'X' });
  assert.equal(n.body.length, 160);
});
