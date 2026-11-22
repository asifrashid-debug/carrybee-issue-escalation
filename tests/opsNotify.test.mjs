import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsNoticeRecipients, opsNotice, opsNoticeRows, OPS_NOTICE_KIND } from '../lib/opsNotify.mjs';

const users = [
  { email: 'jaber.aunto@carrybee.com', role: 'requester', display_name: 'Jaber Al Aunto', kam_aliases: [], is_active: true },
  { email: 'alias.kam@carrybee.com', role: 'mx', display_name: 'Someone Else', kam_aliases: ['Sadia  Noor'], is_active: true },
  { email: 'lead@carrybee.com', role: 'team_lead', display_name: 'Team Lead', kam_aliases: ['Karim'], is_active: true },
  { email: 'admin@carrybee.com', role: 'admin', display_name: 'Rahim Uddin', kam_aliases: [], is_active: true },
  { email: 'gone@carrybee.com', role: 'requester', display_name: 'Gone KAM', kam_aliases: [], is_active: false },
  { email: 'cm@carrybee.com', role: 'cm_member', display_name: 'CM', kam_aliases: [], is_active: true },
];

test('recipients match display name, alias and whitespace/case variants', () => {
  assert.deepEqual(opsNoticeRecipients('Jaber Al Aunto', users), ['jaber.aunto@carrybee.com']);
  assert.deepEqual(opsNoticeRecipients('  jaber   al aunto ', users), ['jaber.aunto@carrybee.com']);
  assert.deepEqual(opsNoticeRecipients('Sadia Noor', users), ['alias.kam@carrybee.com']);
});

test('team lead is notified only for their own KAM name, not for the team', () => {
  assert.deepEqual(opsNoticeRecipients('Karim', users), ['lead@carrybee.com']);
  assert.deepEqual(opsNoticeRecipients('Jaber Al Aunto', users), ['jaber.aunto@carrybee.com']);
});

test('admin and inactive users are never notified', () => {
  assert.deepEqual(opsNoticeRecipients('Rahim Uddin', users), []);
  assert.deepEqual(opsNoticeRecipients('Gone KAM', users), []);
});

test('the CM queue notifies every active CM member and CM lead, not requesters or team leads', () => {
  assert.deepEqual(opsNoticeRecipients('CM', users), ['cm@carrybee.com']);
  const withCmLead = [...users, { email: 'asif.rashid@carrybee.com', role: 'cm_lead', display_name: 'Ahmed Asif Rashid', is_active: true }];
  assert.deepEqual(opsNoticeRecipients('CM', withCmLead), ['cm@carrybee.com', 'asif.rashid@carrybee.com']);
});

test('no KAM name means no notice; unknown name means no notice', () => {
  assert.deepEqual(opsNoticeRecipients('', users), []);
  assert.deepEqual(opsNoticeRecipients(null, users), []);
  assert.deepEqual(opsNoticeRecipients('Nobody Here', users), []);
  assert.deepEqual(opsNoticeRows([{ issue_id: 'CB-1', kam_name: null }], users), []);
});

test('notice text names the issue, category and merchant; issue_id stays null on the row', () => {
  const n = opsNotice({ issue_id: 'CB-23-11-0001', issue_category: 'Forcefully Take', merchant_name: 'NH Natural food BD' });
  assert.equal(n.title, 'CB-23-11-0001: new Ops issue for you');
  assert.equal(n.body, 'Forcefully Take · NH Natural food BD');
  assert.equal(opsNotice({ issue_id: 'CB-1' }).body, 'Ops issue');

  const rows = opsNoticeRows([{ issue_id: 'CB-23-11-0001', kam_name: 'Jaber Al Aunto', issue_category: 'X', merchant_name: 'M' }], users);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    recipient_email: 'jaber.aunto@carrybee.com', issue_id: null, kind: OPS_NOTICE_KIND,
    title: 'CB-23-11-0001: new Ops issue for you', body: 'X · M',
  });
});

test('one row per recipient per new issue', () => {
  const rows = opsNoticeRows([
    { issue_id: 'CB-1', kam_name: 'Karim' },
    { issue_id: 'CB-2', kam_name: 'Jaber Al Aunto' },
  ], users);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.recipient_email), ['lead@carrybee.com', 'jaber.aunto@carrybee.com']);
});
