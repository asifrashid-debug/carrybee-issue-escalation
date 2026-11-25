// IR mail helpers: subject matching, Gmail query, message parsing, attachments. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normSubject, subjectMatches, gmailQueryForSubject, decodeBase64Url, parseMessage,
  filterBySubject, safeAttachmentName, MAIL_BODY_MAX,
} from '../lib/gmailMail.mjs';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('subject match ignores case and extra spaces, but is otherwise exact', () => {
  assert.equal(subjectMatches(' Late  PARCEL case ', 'late parcel case'), true);
  assert.equal(subjectMatches('Late parcel case 2', 'Late parcel case'), false);
  assert.equal(subjectMatches('anything', ''), false, 'empty subject never matches');
  assert.equal(normSubject(null), '');
});

test('Gmail query uses the phrase and drops double quotes from the subject', () => {
  assert.equal(gmailQueryForSubject('Late "parcel"  case'), 'subject:"Late parcel case" -in:spam -in:trash');
});

test('base64url decoding handles - and _ characters', () => {
  assert.equal(decodeBase64Url(b64('hello ?>> world')), 'hello ?>> world');
  assert.equal(decodeBase64Url(''), '');
});

const multipart = {
  id: 'm1', threadId: 't1', internalDate: '1795634000000',
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'Subject', value: 'Late parcel case' }, { name: 'From', value: 'IR Team <ir@carrybee.com>' },
      { name: 'To', value: 'kam@carrybee.com' }, { name: 'Cc', value: 'lead@carrybee.com' }, { name: 'Date', value: 'Sat, 14 Nov 2026 10:00:00 +0600' },
    ],
    parts: [
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/plain', body: { data: b64('Please check the parcel.') } },
        { mimeType: 'text/html', body: { data: b64('<p>Please check the parcel.</p>') } },
      ] },
      { mimeType: 'application/pdf', filename: '../evil/report.pdf', body: { attachmentId: 'ATT1', size: 2048 } },
    ],
  },
};

test('parseMessage reads headers, the plain text body and attachments', () => {
  const m = parseMessage(multipart);
  assert.equal(m.id, 'm1');
  assert.equal(m.subject, 'Late parcel case');
  assert.equal(m.from, 'IR Team <ir@carrybee.com>');
  assert.equal(m.to, 'kam@carrybee.com');
  assert.equal(m.cc, 'lead@carrybee.com');
  assert.equal(m.body, 'Please check the parcel.');
  assert.equal(m.body_truncated, false);
  assert.deepEqual(m.attachments, [{ attachmentId: 'ATT1', filename: '../evil/report.pdf', mimeType: 'application/pdf', size: 2048 }]);
});

test('HTML-only mail is converted to text', () => {
  const m = parseMessage({ id: 'm2', payload: { mimeType: 'text/html', headers: [{ name: 'Subject', value: 'x' }], body: { data: b64('<div>Hi&nbsp;<b>there</b></div><script>bad()</script>') } } });
  assert.equal(m.body, 'Hi there');
});

test('long bodies are cut and flagged', () => {
  const m = parseMessage({ id: 'm3', payload: { mimeType: 'text/plain', headers: [], body: { data: b64('a'.repeat(MAIL_BODY_MAX + 50)) } } });
  assert.equal(m.body.length, MAIL_BODY_MAX);
  assert.equal(m.body_truncated, true);
});

test('filterBySubject keeps exact matches only, newest first', () => {
  const list = [
    { id: 'old', subject: 'Late parcel case', date: 'Fri, 13 Nov 2026 09:00:00 +0600' },
    { id: 'other', subject: 'Late parcel case 2', date: 'Sat, 14 Nov 2026 12:00:00 +0600' },
    { id: 'new', subject: 'late  PARCEL case', date: 'Sat, 14 Nov 2026 11:00:00 +0600' },
  ];
  assert.deepEqual(filterBySubject(list, 'Late parcel case').map((m) => m.id), ['new', 'old']);
});

test('attachment names are reduced to a safe file name', () => {
  assert.equal(safeAttachmentName('../../etc/passwd'), 'passwd');
  assert.equal(safeAttachmentName('a b?c.pdf'), 'a b_c.pdf');
  assert.equal(safeAttachmentName(''), 'attachment');
});
