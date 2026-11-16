import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wave, kpiStrip } from '../components/cw/chartlib.js';

// Every x,y pair in the stroked line path must sit inside the plot box (top pt=14, bottom pt+ih=204 for the default 230px chart).
const linePath = (svg) => {
  const m = [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="/g)].map((x) => x[1]);
  assert.ok(m.length > 0, 'line path present');
  return m[0];
};

test('wave line never dips below the zero baseline between zero values', () => {
  const svg = wave({ labels: ['a', 'b', 'c', 'd', 'e', 'f'], every: 1, series: [{ data: [0, 0, 4, 1, 0, 0], color: '#000' }] });
  const d = linePath(svg);
  const pairs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  for (const [, y] of pairs) {
    assert.ok(y >= 13.9 && y <= 204.1, `y ${y} outside plot box 14..204`);
  }
});

test('wave keeps the peak at its data value', () => {
  const svg = wave({ labels: ['a', 'b', 'c'], every: 1, series: [{ data: [0, 4, 0], color: '#000' }] });
  // Plot width 640 gives x(1)=332.0; the peak 4 equals the axis max, so y=14.0 (top of the plot box).
  assert.match(linePath(svg), /332\.0,14\.0/);
});

test('kpiStrip adds the five-card class only for five cards', () => {
  const card = { label: 'x', value: '1', icon: 'escalation', sub: '' };
  assert.match(kpiStrip([card, card, card, card, card]), /class="kpis k5"/);
  assert.match(kpiStrip([card, card, card, card]), /class="kpis"/);
  assert.doesNotMatch(kpiStrip([card, card, card, card]), /k5/);
});
