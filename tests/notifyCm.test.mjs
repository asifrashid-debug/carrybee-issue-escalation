import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cmRecipients, cmNoticeRows, newCmIssueNotice, hubNotice, notifyRecipients } from '../lib/notify.js';

const users = [
  { email: 'Cm.Member@carrybee.com', role: 'cm_member', teams: ['CM'] },
  { email: 'cm.lead@carrybee.com', role: 'cm_lead', teams: ['CM'] },
  { email: 'kam@carrybee.com', role: 'kam', teams: ['KAM A'] },
  { email: 'ops@carrybee.com', role: 'ops', teams: [] },
  { email: 'admin@carrybee.com', role: 'admin', teams: [] },
];

test('cmRecipients is CM members and CM leads only, lower-cased', () => {
  assert.deepEqual(cmRecipients(users), ['cm.member@carrybee.com', 'cm.lead@carrybee.com']);
});

test('cmRecipients drops duplicates and missing emails', () => {
  assert.deepEqual(cmRecipients([{ email: 'A@x.com', role: 'cm_lead' }, { email: 'a@x.com', role: 'cm_lead' }, { role: 'cm_member' }]), ['a@x.com']);
});

test('a CM-assigned issue writes one row per CM recipient, with kind cm_new_issue', () => {
  const esc = { issue_id: 'CB-18-11-AAAA', cm_assigned: true, zone: 'ISD', concern_hub: 'Mirpur', issue_category: 'Delivery Delay' };
  const rows = cmNoticeRows(esc, users);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.kind === 'cm_new_issue' && r.issue_id === 'CB-18-11-AAAA'));
  assert.equal(rows[0].title, 'CB-18-11-AAAA: new CM issue');
  assert.equal(rows[0].body, 'Delivery Delay · ISD · Mirpur');
});

test('a normal issue writes no CM rows', () => {
  assert.deepEqual(cmNoticeRows({ issue_id: 'CB-1', cm_assigned: false }, users), []);
  assert.deepEqual(cmNoticeRows({ issue_id: 'CB-1' }, users), []);
});

test('notice body falls back to the category when zone and hub are missing', () => {
  assert.equal(newCmIssueNotice({ issue_id: 'CB-2', issue_category: 'Fraud' }).body, 'Fraud');
  assert.equal(newCmIssueNotice({ issue_id: 'CB-3' }).body, 'Issue');
});

test('hub response notices and recipients are unchanged', () => {
  assert.equal(hubNotice('layer1_response', 'Checked', { issue_id: 'CB-4' }).title, 'CB-4: hub updated the Layer 1 response');
  assert.equal(hubNotice('merchant_name', 'x', { issue_id: 'CB-4' }), null);
  const raiser = { teams: ['KAM A'] };
  const got = notifyRecipients({ email: 'KAM@carrybee.com' }, raiser, [{ email: 'tl@carrybee.com', role: 'team_lead', teams: ['KAM A'] }]);
  assert.deepEqual(got.sort(), ['kam@carrybee.com', 'tl@carrybee.com']);
});
