import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECT_WRITE_ROUTES, usesDirectWrite } from '../lib/sortTnlRoutes.mjs';

// TNL is written straight to its sheet. Central Sort keeps its web app, which works.
test('TNL uses the direct Sheets write; Central Sort keeps its web app', () => {
  assert.deepEqual(DIRECT_WRITE_ROUTES, ['tnl']);
  assert.equal(usesDirectWrite('tnl'), true);
  assert.equal(usesDirectWrite('central_sort'), false);
  assert.equal(usesDirectWrite('ir'), false);
  assert.equal(usesDirectWrite(undefined), false);
});

// The TNL path must not depend on the web app or its secret.
test('the TNL branch in sheets.js does not call the route script', () => {
  const src = readFileSync(new URL('../lib/sheets.js', import.meta.url), 'utf8');
  const push = src.slice(src.indexOf('export async function pushRouteToSheet'), src.indexOf('async function writeEscToSheet'));
  const fields = src.slice(src.indexOf('async function pushRouteFields'), src.indexOf('export async function readSheetOps'));
  const directPush = push.slice(0, push.indexOf('const res = await callRouteScript'));
  const directFields = fields.slice(0, fields.indexOf('const res = await callRouteScript'));
  assert.match(directPush, /writeEscToSheet\(esc, sid\)/);
  assert.match(directFields, /not_on_sheet/);
  assert.doesNotMatch(directPush + directFields, /callRouteScript/);
});
