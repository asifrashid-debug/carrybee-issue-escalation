import { test } from 'node:test';
import assert from 'node:assert/strict';
import { officeHoursBetween } from '../lib/officeHours.js';

// Dhaka times below are written with +06:00 so the test does not depend on the server timezone.
test('same-day response inside office hours counts the real elapsed time', () => {
  assert.equal(officeHoursBetween('2026-11-24T10:00:00+06:00', '2026-11-24T11:30:00+06:00'), 1.5);
});

test('submission after 20:00 waits for 10:00 the next day', () => {
  // 19:00-20:00 (1h) + 10:00-10:30 next day (0.5h)
  assert.equal(officeHoursBetween('2026-11-24T19:00:00+06:00', '2026-11-25T10:30:00+06:00'), 1.5);
});

test('overnight gap is not counted', () => {
  // 19:00-20:00 (1h) + 10:00-11:30 next day (1.5h) = 2.5h, which is over the 2h SLA
  assert.equal(officeHoursBetween('2026-11-24T19:00:00+06:00', '2026-11-25T11:30:00+06:00'), 2.5);
});

test('submission before 10:00 starts the clock at 10:00', () => {
  assert.equal(officeHoursBetween('2026-11-24T02:00:00+06:00', '2026-11-24T10:30:00+06:00'), 0.5);
});

test('exactly 2 office hours is within the SLA boundary', () => {
  assert.equal(officeHoursBetween('2026-11-24T10:00:00+06:00', '2026-11-24T12:00:00+06:00'), 2);
});

test('multi-day gap counts only office hours on each day', () => {
  // Mon 20:00 -> Wed 10:00: Tue full day (10h) + Wed 10:00-10:00 (0h)
  assert.equal(officeHoursBetween('2026-11-23T20:00:00+06:00', '2026-11-25T10:00:00+06:00'), 10);
});

test('response before submission returns 0 (treated as within SLA, as before)', () => {
  assert.equal(officeHoursBetween('2026-11-24T12:00:00+06:00', '2026-11-24T11:00:00+06:00'), 0);
});
