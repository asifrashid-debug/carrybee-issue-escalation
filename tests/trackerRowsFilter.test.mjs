import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackerRowsFilter, trackerItems, hasLayerResponse } from '../lib/trackerBadge.mjs';

test('each viewer clause is paired with each layer response', () => {
  const f = trackerRowsFilter(['email.eq."a@x.com"', 'kam_name.ilike."*ann*"']);
  assert.equal(f.split(',and(').length, 6, 'two clauses x three layers');
  assert.match(f, /and\(email\.eq\."a@x\.com",layer1_response\.not\.is\.null\)/);
  assert.match(f, /and\(kam_name\.ilike\."\*ann\*",layer3_response\.not\.is\.null\)/);
});

test('no clauses gives an empty filter (the route returns no items before reaching it)', () => {
  assert.equal(trackerRowsFilter([]), '');
});

test('the rule itself is unchanged: rows without a real response are still excluded', () => {
  const viewer = { email: 'a@x.com', display_name: 'Ann', role: 'requester' };
  const rows = [
    { issue_id: 'A', channel: 'MX', email: 'a@x.com', layer1_response: 'ok' },
    { issue_id: 'B', channel: 'MX', email: 'a@x.com', layer1_response: '   ', layer2_response: null },
    { issue_id: 'C', channel: 'MX', email: 'a@x.com', layer1_response: null, layer2_response: '' },
  ];
  assert.deepEqual(trackerItems(rows, viewer).map((i) => i.issue_id), ['A']);
  assert.equal(hasLayerResponse(rows[1]), false);
})
