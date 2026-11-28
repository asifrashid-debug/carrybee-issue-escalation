import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dhakaDay } from '../lib/dateRange.js';

const intl = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

test('matches Intl for Asia/Dhaka across many instants, including day and year edges', () => {
  const start = Date.parse('2020-01-01T00:00:00Z');
  for (let t = start; t < start + 8 * 365 * 86400e3; t += 3.7 * 3600e3) {
    const d = new Date(t);
    assert.equal(dhakaDay(d), intl(d), d.toISOString());
  }
  for (const iso of ['2026-12-31T17:59:59.999Z', '2026-12-31T18:00:00Z', '2026-01-01T17:59:59Z', '2026-06-30T23:59:59Z']) {
    assert.equal(dhakaDay(new Date(iso)), intl(new Date(iso)), iso);
  }
});

test('Dhaka is UTC+6 with no daylight saving in the test window: 18:00 UTC is the next Dhaka day', () => {
  assert.equal(dhakaDay(new Date('2026-11-27T17:59:00Z')), '2026-11-27');
  assert.equal(dhakaDay(new Date('2026-11-27T18:00:00Z')), '2026-11-28');
});

test('an invalid date throws, as Intl does', () => {
  assert.throws(() => dhakaDay(new Date('nope')), RangeError);
})
