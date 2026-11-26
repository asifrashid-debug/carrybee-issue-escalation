import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeScriptUrl, rowToCells, cellsFromPlan, callRouteScript, ROUTE_SCRIPT_ENV } from '../lib/routeScript.mjs';

test('each route has its own web app URL env var', () => {
  assert.deepEqual(ROUTE_SCRIPT_ENV, { central_sort: 'ROUTE_SCRIPT_URL_CENTRAL_SORT', tnl: 'ROUTE_SCRIPT_URL_TNL' });
  const env = { ROUTE_SCRIPT_URL_CENTRAL_SORT: 'https://cs', ROUTE_SCRIPT_URL_TNL: 'https://tnl' };
  assert.equal(routeScriptUrl('central_sort', env), 'https://cs');
  assert.equal(routeScriptUrl('tnl', env), 'https://tnl');
  assert.equal(routeScriptUrl('tnl', {}), null);
  assert.equal(routeScriptUrl('ir', env), null);
});

test('rowToCells maps index to column letter and never includes U', () => {
  const row = Array.from({ length: 35 }, (_, i) => `v${i}`);
  const cells = rowToCells(row);
  assert.equal(cells.A, 'v0');
  assert.equal(cells.T, 'v19');
  assert.equal(cells.V, 'v21');
  assert.equal(cells.AI, 'v34');
  assert.equal('U' in cells, false);
  assert.equal(Object.keys(cells).length, 34);
});

test('rowToCells turns undefined and null into empty strings', () => {
  const cells = rowToCells(['x', undefined, null]);
  assert.equal(cells.B, '');
  assert.equal(cells.C, '');
});

test('cellsFromPlan drops U and keeps the rest', () => {
  const cells = cellsFromPlan([{ col: 'AA', value: 'Completed' }, { col: 'U', value: '=NOW()' }, { col: 'AG', value: null }]);
  assert.deepEqual(cells, { AA: 'Completed', AG: '' });
});

test('callRouteScript posts the secret and route, and returns the JSON reply', async () => {
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts, body: JSON.parse(opts.body) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ row: 5, action: 'updated' }) };
  };
  const env = { ROUTE_SCRIPT_URL_TNL: 'https://script/tnl', ROUTE_SCRIPT_SECRET: 's3cret' };
  const out = await callRouteScript('tnl', { action: 'update', issue_id: 'CB-1', cells: { AA: 'x' } }, { env, fetchImpl });
  assert.deepEqual(out, { row: 5, action: 'updated' });
  assert.equal(seen.url, 'https://script/tnl');
  assert.equal(seen.body.secret, 's3cret');
  assert.equal(seen.body.sheet_route, 'tnl');
  assert.equal(seen.body.issue_id, 'CB-1');
});

test('callRouteScript fails clearly, without the secret or URL in the message', async () => {
  const env = { ROUTE_SCRIPT_URL_TNL: 'https://script/tnl', ROUTE_SCRIPT_SECRET: 's3cret' };
  const refuse = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ error: 'unauthorized' }) });
  await assert.rejects(callRouteScript('tnl', { action: 'upsert' }, { env, fetchImpl: refuse }), (e) => {
    assert.match(e.message, /unauthorized/);
    assert.equal(e.message.includes('s3cret'), false);
    assert.equal(e.message.includes('script/tnl'), false);
    return true;
  });
  const html = async () => ({ ok: false, status: 302, text: async () => '<html>login</html>' });
  await assert.rejects(callRouteScript('tnl', {}, { env, fetchImpl: html }), /non-JSON/);
  await assert.rejects(callRouteScript('central_sort', {}, { env, fetchImpl: html }), /No script URL set/);
  await assert.rejects(callRouteScript('tnl', {}, { env: { ROUTE_SCRIPT_URL_TNL: 'x' }, fetchImpl: html }), /ROUTE_SCRIPT_SECRET is not set/);
});
