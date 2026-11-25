import test from 'node:test';
import assert from 'node:assert/strict';
import { routeListFilter } from '../lib/irEscalation.mjs';

test('the tracker (no route) shows HUB-ticked issues only', () => {
  assert.deepEqual(routeListFilter(null), { column: 'route_hub', value: true });
  assert.deepEqual(routeListFilter(undefined), { column: 'route_hub', value: true });
  assert.deepEqual(routeListFilter('hub'), { column: 'route_hub', value: true });
});

test('the IR tab (route=ir) shows IR-ticked issues only', () => {
  assert.deepEqual(routeListFilter('ir'), { column: 'route_ir', value: true });
});
