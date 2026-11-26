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

test('the Central Sort tab shows Central-Sort-ticked issues only', () => {
  assert.deepEqual(routeListFilter('central_sort'), { column: 'route_central_sort', value: true });
});

test('the TNL tab shows TNL-ticked issues only', () => {
  assert.deepEqual(routeListFilter('tnl'), { column: 'route_tnl', value: true });
});

test('unknown route values fall back to the tracker (HUB) filter', () => {
  assert.deepEqual(routeListFilter('bogus'), { column: 'route_hub', value: true });
  assert.deepEqual(routeListFilter('constructor'), { column: 'route_hub', value: true });
});
