import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SORT_TNL_ROUTES, SORT_TNL_LABELS, sortTnlSheetId } from '../lib/sortTnlRoutes.mjs';

test('two routes, labelled Central Sort and TNL', () => {
  assert.deepEqual(SORT_TNL_ROUTES, ['central_sort', 'tnl']);
  assert.equal(SORT_TNL_LABELS.central_sort, 'Central Sort');
  assert.equal(SORT_TNL_LABELS.tnl, 'TNL');
});

test('each route reads its own sheet env var', () => {
  const env = { SHEET_CENTRAL_SORT: 'cs-id', SHEET_TNL: 'tnl-id' };
  assert.equal(sortTnlSheetId('central_sort', env), 'cs-id');
  assert.equal(sortTnlSheetId('tnl', env), 'tnl-id');
});

test('missing env var, empty value or unknown route gives null (never a guessed sheet)', () => {
  assert.equal(sortTnlSheetId('tnl', {}), null);
  assert.equal(sortTnlSheetId('central_sort', { SHEET_CENTRAL_SORT: '' }), null);
  assert.equal(sortTnlSheetId('ir', { SHEET_TNL: 'x' }), null);
});
