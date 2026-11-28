// Regression: GET /api/escalations used an undefined `listRoute` for the resolved-this-week count.
// Every list request then threw, and the tracker showed "Could not load issues".
// The count must use the same route and escalated filters as the list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app/api/escalations/route.js', import.meta.url), 'utf8');

test('no undefined listRoute reference in the escalations route', () => {
  assert.doesNotMatch(src, /\blistRoute\b/);
});

test('resolved count uses the same route filter as the list', () => {
  assert.match(src, /rwq = applyRouteListFilter\(rwq, searchParams\.get\('route'\)\)/);
});

test('resolved count applies the escalated view rule like the list', () => {
  assert.match(src, /rwq = rwq\.not\('escalated_to', 'is', null\)/);
});

test('main tracker list does not hide escalated issues', () => {
  assert.doesNotMatch(src, /\.is\('escalated_to', null\)/);
});
