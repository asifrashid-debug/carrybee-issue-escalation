// Tests for lib/hubLookupServer.mjs: the no-extension hub lookup (Hive API + tracker history)
// used by /api/hub-lookup so phones can auto-fill the Concern Hub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractByPath, buildHiveRequest, historyHubFromRows, serverHubLookup,
} from '../lib/hubLookupServer.mjs';

// A thenable stand-in for the supabase admin client: sb.from(...).select(...)...limit(n) awaits to { data, error }.
function fakeSb(data, error = null) {
  const q = {
    select() { return q; },
    eq() { return q; },
    order() { return q; },
    limit() { return q; },
    then: (res, rej) => Promise.resolve({ data, error }).then(res, rej),
  };
  return { from: () => q };
}

function fakeFetch(status, json) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });
}

test('extractByPath: resolves dot paths and trims strings', () => {
  const v = { hub: '  Dhaka  ', data: { currentHub: 'Chattogram', nested: { hub: 'ISD' } }, count: 42 };
  assert.equal(extractByPath(v, 'hub'), 'Dhaka');
  assert.equal(extractByPath(v, 'data.currentHub'), 'Chattogram');
  assert.equal(extractByPath(v, 'data.nested.hub'), 'ISD');
  assert.equal(extractByPath(v, 'count'), '42'); // numbers become strings
});

test('extractByPath: returns null for missing paths, empty path, and non-scalar terminals', () => {
  assert.equal(extractByPath({ hub: 'X' }, 'data.hub'), null);
  assert.equal(extractByPath({ hub: 'X' }, ''), null);
  assert.equal(extractByPath(null, 'hub'), null);
  assert.equal(extractByPath({ data: { more: {} } }, 'data.more'), null);
  assert.equal(extractByPath({ hub: null }, 'hub'), null);
});

test('buildHiveRequest: GET by default, {id} replaced, key as Bearer token', () => {
  const req = buildHiveRequest({ HIVE_API_URL: 'https://hive.example/track/{id}', HIVE_API_KEY: 'k-1' }, 'CB-2026110899');
  assert.deepEqual(req, {
    url: 'https://hive.example/track/CB-2026110899',
    method: 'GET',
    headers: { authorization: 'Bearer k-1' },
    body: undefined,
  });
});

test('buildHiveRequest: POST sends the ID in a JSON body', () => {
  const req = buildHiveRequest({ HIVE_API_URL: 'https://hive.example/lookup', HIVE_LOOKUP_METHOD: 'post' }, '10948271');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['content-type'], 'application/json');
  assert.equal(req.body, JSON.stringify({ consignment_id: '10948271' }));
  assert.equal(req.headers.authorization, undefined);
});

test('historyHubFromRows: first non-empty hub wins, newest first', () => {
  const rows = [
    { concern_hub: '', submitted_at: '2026-11-10T00:00:00Z' },
    { concern_hub: '  Chattogram  ', submitted_at: '2026-11-09T00:00:00Z' },
    { concern_hub: 'Dhaka', submitted_at: '2026-11-01T00:00:00Z' },
  ];
  assert.deepEqual(historyHubFromRows(rows), { hub: 'Chattogram', at: '2026-11-09T00:00:00Z' });
});

test('historyHubFromRows: empty, null, non-array and hub-less rows give null', () => {
  assert.equal(historyHubFromRows([]), null);
  assert.equal(historyHubFromRows(null), null);
  assert.equal(historyHubFromRows('nope'), null);
  assert.equal(historyHubFromRows([{ concern_hub: null }, { submitted_at: 'x' }]), null);
});

test('serverHubLookup: invalid Consignment ID is rejected', async () => {
  const r = await serverHubLookup('bad id!', { sb: fakeSb([]) });
  assert.equal(r.hub, null);
  assert.equal(r.error, 'Enter a valid Consignment ID first.');
});

test('serverHubLookup: no Hive configured uses tracker history only', async () => {
  const rows = [{ concern_hub: 'Dhaka', submitted_at: '2026-11-08T06:00:00Z' }];
  const r = await serverHubLookup('CB-1', { sb: fakeSb(rows), env: {}, fetchImpl: fakeFetch(200, {}) });
  assert.deepEqual(r, { hub: 'Dhaka', source: 'history', history_at: '2026-11-08T06:00:00Z', hive_configured: false, error: null });
});

test('serverHubLookup: nothing found and no error when history is empty (client offers manual selection)', async () => {
  const r = await serverHubLookup('CB-2', { sb: fakeSb([]), env: {}, fetchImpl: fakeFetch(200, {}) });
  assert.deepEqual(r, { hub: null, source: null, history_at: null, hive_configured: false, error: null });
});

test('serverHubLookup: configured Hive is tried and its hub wins', async () => {
  const env = { HIVE_API_URL: 'https://hive.example/track/{id}', HIVE_API_KEY: 'k', HIVE_HUB_JSON_PATH: 'data.currentHub' };
  const rows = [{ concern_hub: 'Dhaka', submitted_at: '2026-11-08T06:00:00Z' }];
  const r = await serverHubLookup('CB-3', { sb: fakeSb(rows), env, fetchImpl: fakeFetch(200, { data: { currentHub: 'Chattogram' } }) });
  assert.equal(r.hub, 'Chattogram');
  assert.equal(r.source, 'hive');
  assert.equal(r.hive_configured, true);
  assert.equal(r.error, null);
  // The history is still reported so the UI can say where the last escalation came from.
  assert.equal(r.history_at, '2026-11-08T06:00:00Z');
});

test('serverHubLookup: Hive HTTP failure falls back to history without an error', async () => {
  const env = { HIVE_API_URL: 'https://hive.example/track/{id}' };
  const rows = [{ concern_hub: 'Khulna', submitted_at: '2026-11-05T06:00:00Z' }];
  const r = await serverHubLookup('CB-4', { sb: fakeSb(rows), env, fetchImpl: fakeFetch(503, null) });
  assert.equal(r.hub, 'Khulna');
  assert.equal(r.source, 'history');
  assert.equal(r.error, null);
});

test('serverHubLookup: Hive network failure with no history reports the error', async () => {
  const env = { HIVE_API_URL: 'https://hive.example/track/{id}' };
  const r = await serverHubLookup('CB-5', {
    sb: fakeSb([]), env,
    fetchImpl: async () => { throw new Error('network down'); },
  });
  assert.equal(r.hub, null);
  assert.equal(r.source, null);
  assert.equal(r.error, 'network down');
});

test('serverHubLookup: Hive ok but no hub in the JSON, and no history, reports the missing hub', async () => {
  const env = { HIVE_API_URL: 'https://hive.example/track/{id}' };
  const r = await serverHubLookup('CB-6', { sb: fakeSb([]), env, fetchImpl: fakeFetch(200, { something: 'else' }) });
  assert.equal(r.hub, null);
  assert.equal(r.error, 'Hive returned no hub for this Consignment ID.');
});

test('serverHubLookup: history query failure surfaces when nothing else worked', async () => {
  const r = await serverHubLookup('CB-7', { sb: fakeSb(null, { message: 'relation does not exist' }), env: {}, fetchImpl: fakeFetch(200, {}) });
  assert.equal(r.hub, null);
  assert.equal(r.error, 'relation does not exist');
});

test('serverHubLookup: invalid JSON from Hive does not throw', async () => {
  const env = { HIVE_API_URL: 'https://hive.example/track/{id}' };
  const r = await serverHubLookup('CB-8', {
    sb: fakeSb([{ concern_hub: 'Sylhet', submitted_at: '2026-11-02T06:00:00Z' }]), env,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  });
  assert.equal(r.hub, 'Sylhet');
  assert.equal(r.source, 'history');
  assert.equal(r.error, null); // the history saved the lookup: no error
});
