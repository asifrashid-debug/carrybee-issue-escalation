import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMxIssue, requestHash, bearerToken, apiKeyOk, MX_ROUTES } from '../lib/mxApi.mjs';

const good = () => ({
  external_id: 'MXCRM-000123',
  reporter_email: '  Rahim.Ahmed@Carrybee.com ',
  consignment_id: ' CB12345 ',
  merchant_name: 'Acme   Store',
  concern_hub: 'Mirpur Hub',
  issue_category: 'Delay',
  issue_sub_category: 'Late pickup',
  issue_details: 'Parcel was not picked up within the promised window.',
});

test('a complete MX payload is accepted and cleaned', () => {
  const v = validateMxIssue(good());
  assert.equal(v.ok, true);
  assert.equal(v.clean.reporter_email, 'rahim.ahmed@carrybee.com');
  assert.equal(v.clean.consignment_id, 'CB12345');
  assert.equal(v.clean.merchant_name, 'Acme Store');
});

test('external_id is required and limited to safe characters', () => {
  assert.equal(validateMxIssue({ ...good(), external_id: '' }).errors[0].field, 'external_id');
  assert.equal(validateMxIssue({ ...good(), external_id: 'bad id/with slash' }).errors[0].field, 'external_id');
  assert.equal(validateMxIssue({ ...good(), external_id: 'x'.repeat(101) }).errors[0].field, 'external_id');
});

test('reporter_email must be a valid email', () => {
  assert.equal(validateMxIssue({ ...good(), reporter_email: 'not-an-email' }).errors[0].field, 'reporter_email');
  assert.equal(validateMxIssue({ ...good(), reporter_email: '' }).errors[0].field, 'reporter_email');
});

test('consignment ID or merchant name: at least one is required', () => {
  const v = validateMxIssue({ ...good(), consignment_id: '', merchant_name: '   ' });
  assert.equal(v.ok, false);
  assert.match(v.errors[0].message, /at least one/);
  assert.equal(validateMxIssue({ ...good(), consignment_id: '', merchant_name: 'Acme' }).ok, true);
  assert.equal(validateMxIssue({ ...good(), merchant_name: '', consignment_id: 'CB100001' }).ok, true);
});

test('consignment ID follows the database rule: 6 to 30 letters, digits or dashes', () => {
  assert.equal(validateMxIssue({ ...good(), consignment_id: 'CB 12345' }).errors[0].field, 'consignment_id');
  assert.equal(validateMxIssue({ ...good(), consignment_id: 'CB_123456' }).errors[0].field, 'consignment_id');
  assert.equal(validateMxIssue({ ...good(), consignment_id: 'CB12' }).errors[0].field, 'consignment_id');
  assert.equal(validateMxIssue({ ...good(), consignment_id: 'x'.repeat(31) }).errors[0].field, 'consignment_id');
  assert.equal(validateMxIssue({ ...good(), consignment_id: 'CB-123456' }).ok, true);
  assert.equal(validateMxIssue({ ...good(), consignment_id: 'cb-123456' }).ok, true);
});

test('issue details need 20 to 2000 characters', () => {
  assert.equal(validateMxIssue({ ...good(), issue_details: 'too short' }).errors[0].field, 'issue_details');
  assert.equal(validateMxIssue({ ...good(), issue_details: 'x'.repeat(2001) }).errors[0].field, 'issue_details');
  assert.equal(validateMxIssue({ ...good(), issue_details: 'x'.repeat(20) }).ok, true);
});

test('hub, category and sub category are required', () => {
  const fields = ['concern_hub', 'issue_category', 'issue_sub_category'];
  for (const f of fields) {
    const v = validateMxIssue({ ...good(), [f]: '' });
    assert.equal(v.ok, false, f);
    assert.ok(v.errors.some((e) => e.field === f), f);
  }
});

test('the body must be a JSON object', () => {
  assert.equal(validateMxIssue(null).ok, false);
  assert.equal(validateMxIssue([]).ok, false);
  assert.equal(validateMxIssue('text').ok, false);
});

test('routing: every MX API issue goes to HUB, and only to HUB', () => {
  assert.deepEqual(MX_ROUTES, { hub: true, ir: false, central_sort: false, tnl: false });
});

test('route fields in the body are ignored, not trusted', () => {
  const v = validateMxIssue({ ...good(), route_hub: false, route_ir: true, route_tnl: true, route_central_sort: true });
  assert.equal(v.ok, true);
  assert.equal('route_ir' in v.clean, false);
  assert.equal('route_hub' in v.clean, false);
});

test('request fingerprint ignores key order and changes with content', () => {
  const a = validateMxIssue(good()).clean;
  const reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(requestHash(a), requestHash(reordered));
  const b = { ...a, issue_details: a.issue_details + ' More detail.' };
  assert.notEqual(requestHash(a), requestHash(b));
});

test('bearer token parsing', () => {
  assert.equal(bearerToken('Bearer abc123'), 'abc123');
  assert.equal(bearerToken('bearer   abc123  '), 'abc123');
  assert.equal(bearerToken('Basic abc'), '');
  assert.equal(bearerToken(null), '');
});

test('API key check: exact match only, and nothing accepted when no key is configured', () => {
  assert.equal(apiKeyOk('secret-key-1', 'secret-key-1'), true);
  assert.equal(apiKeyOk('secret-key-2', 'secret-key-1'), false);
  assert.equal(apiKeyOk('secret-key-1 ', 'secret-key-1'), false);
  assert.equal(apiKeyOk('', 'secret-key-1'), false);
  assert.equal(apiKeyOk('anything', ''), false);
  assert.equal(apiKeyOk('anything', undefined), false);
});
