// Gmail token check helpers: env status, mailbox match, scope match, safe error text. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmailEnvStatus, sameMailbox, hasReadonlyScope, describeGoogleError, GMAIL_READONLY_SCOPE } from '../lib/gmailCheck.mjs';

test('env status reports presence only, never values', () => {
  const s = gmailEnvStatus({ GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: '  ', GMAIL_OAUTH_REFRESH_TOKEN: 'tok', GMAIL_USER: 'a@b.c' });
  assert.equal(s.GOOGLE_OAUTH_CLIENT_ID, true);
  assert.equal(s.GOOGLE_OAUTH_CLIENT_SECRET, false, 'blank counts as missing');
  assert.deepEqual(s.missing, ['GOOGLE_OAUTH_CLIENT_SECRET']);
  assert.equal(JSON.stringify(s).includes('tok'), false, 'no values in the result');
});

test('mailbox match ignores case and spaces, and an empty side never matches', () => {
  assert.equal(sameMailbox(' Asif@Carrybee.com ', 'asif@carrybee.com'), true);
  assert.equal(sameMailbox('a@b.c', 'x@y.z'), false);
  assert.equal(sameMailbox('', ''), false);
  assert.equal(sameMailbox(null, 'a@b.c'), false);
});

test('scope check needs the exact gmail.readonly scope', () => {
  assert.equal(hasReadonlyScope(`https://www.googleapis.com/auth/spreadsheets ${GMAIL_READONLY_SCOPE}`), true);
  assert.equal(hasReadonlyScope('https://www.googleapis.com/auth/gmail.readonly.extra'), false);
  assert.equal(hasReadonlyScope(''), false);
});

test('Google errors are reduced to code and message, with no token fields', () => {
  const e = { response: { data: { error: 'unauthorized_client', error_description: 'Unauthorized', refresh_token: 'SECRET' } } };
  const d = describeGoogleError(e);
  assert.deepEqual(d, { google_error: 'unauthorized_client', google_error_description: 'Unauthorized' });
  assert.equal(JSON.stringify(d).includes('SECRET'), false);
  assert.equal(describeGoogleError(new Error('boom')).google_error, null);
  assert.equal(describeGoogleError(new Error('x'.repeat(500))).google_error_description.length, 300);
});
