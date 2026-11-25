import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerClockStart, addOfficeHours, responseWithinDeadlines, formatResponseWithin, responseWithinStatus } from '../lib/responseWithin.mjs';

// Dhaka wall-clock -> ISO (Dhaka is UTC+6, no DST).
const dh = (y, m, d, h, mi = 0) => new Date(Date.UTC(y, m - 1, d, h - 6, mi)).toISOString();

test('raise at 10:00 (user example): L1 1 PM, L2 3 PM, L3 5 PM', () => {
  const d = responseWithinDeadlines(dh(2026, 11, 14, 10));
  assert.equal(d.start, dh(2026, 11, 14, 12));
  assert.equal(d.layer1, dh(2026, 11, 14, 13));
  assert.equal(d.layer2, dh(2026, 11, 14, 15));
  assert.equal(d.layer3, dh(2026, 11, 14, 17));
  assert.equal(formatResponseWithin(dh(2026, 11, 14, 10)), 'Layer 1 - 1:00 PM | Layer 2 - 3:00 PM | Layer 3 - 5:00 PM');
});

test('raise 00:30 and 11:59 start at 12:00 the same day', () => {
  assert.equal(layerClockStart(dh(2026, 11, 14, 0, 30)), new Date(dh(2026, 11, 14, 12)).getTime());
  assert.equal(layerClockStart(dh(2026, 11, 14, 11, 59)), new Date(dh(2026, 11, 14, 12)).getTime());
});

test('raise at 12:00 and 19:59 start immediately', () => {
  assert.equal(layerClockStart(dh(2026, 11, 14, 12)), new Date(dh(2026, 11, 14, 12)).getTime());
  assert.equal(layerClockStart(dh(2026, 11, 14, 19, 59)), new Date(dh(2026, 11, 14, 19, 59)).getTime());
});

test('raise at 20:00 and 23:30 start at 12:00 the next day', () => {
  assert.equal(layerClockStart(dh(2026, 11, 14, 20)), new Date(dh(2026, 11, 15, 12)).getTime());
  assert.equal(layerClockStart(dh(2026, 11, 14, 23, 30)), new Date(dh(2026, 11, 15, 12)).getTime());
});

test('raise 19:00: L1 ends at 20:00, L2 and L3 continue the next morning', () => {
  const d = responseWithinDeadlines(dh(2026, 11, 14, 19));
  assert.equal(d.layer1, dh(2026, 11, 14, 20));
  assert.equal(d.layer2, dh(2026, 11, 15, 12));
  assert.equal(d.layer3, dh(2026, 11, 15, 14));
});

test('raise 19:30: L1 spills 30 min into the next morning at 10:30', () => {
  const d = responseWithinDeadlines(dh(2026, 11, 14, 19, 30));
  assert.equal(d.layer1, dh(2026, 11, 15, 10, 30));
  assert.equal(d.layer2, dh(2026, 11, 15, 12, 30));
  assert.equal(d.layer3, dh(2026, 11, 15, 14, 30));
});

test('raise 20:00: L1 1 PM next day, chain stays inside office hours', () => {
  const d = responseWithinDeadlines(dh(2026, 11, 14, 20));
  assert.equal(d.layer1, dh(2026, 11, 15, 13));
  assert.equal(d.layer2, dh(2026, 11, 15, 15));
  assert.equal(d.layer3, dh(2026, 11, 15, 17));
});

test('office hours skip closed time: 18:00 + 3 office hours lands at 12:00 next day', () => {
  // 18:00 -> 20:00 (2h), then 10:00 -> 11:00 (1h)
  assert.equal(addOfficeHours(new Date(dh(2026, 11, 14, 18)).getTime(), 3), new Date(dh(2026, 11, 15, 11)).getTime());
});

test('every day counts, including Friday (no off day)', () => {
  // Friday 13 Nov 2026, raised 10:00 -> same as any day
  const d = responseWithinDeadlines(dh(2026, 11, 13, 10));
  assert.equal(d.layer1, dh(2026, 11, 13, 13));
  assert.equal(d.layer3, dh(2026, 11, 13, 17));
});

test('formatted text adds the date when a deadline falls on the next day', () => {
  assert.equal(
    formatResponseWithin(dh(2026, 11, 14, 19)),
    'Layer 1 - 8:00 PM | Layer 2 - 15 Nov 12:00 PM | Layer 3 - 15 Nov 2:00 PM',
  );
});

test('accepts UTC ISO from the database (2026-11-14T04:00:00Z = 10:00 Dhaka)', () => {
  assert.equal(formatResponseWithin('2026-11-14T04:00:00Z'), 'Layer 1 - 1:00 PM | Layer 2 - 3:00 PM | Layer 3 - 5:00 PM');
});

test('invalid input returns null, not a bad string', () => {
  assert.equal(responseWithinDeadlines('not a date'), null);
  assert.equal(formatResponseWithin(null), '');
});


// Active-layer status for column U. Raise 10:00 -> L1 13:00, L2 15:00, L3 17:00 (Dhaka).
const raise10 = dh(2026, 11, 14, 10);
const at = (h, m = 0) => new Date(dh(2026, 11, 14, h, m));
test('status: Layer 1 active before its 1h deadline', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(12, 30)), 'Layer 1 - 1:00 PM');
});
test('status: Layer 1 missed (no response at 13:00) -> Layer 2 active', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(13, 1)), 'Layer 2 - 3:00 PM');
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(14, 59)), 'Layer 2 - 3:00 PM');
});
test('status: Layer 2 missed (no response at 15:00) -> Layer 3 active', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(15, 1)), 'Layer 3 - 5:00 PM');
});
test('status: all deadlines missed with no response -> Overdue', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(17, 1)), 'Overdue');
});
test('status: Layer 1 answered in time -> Responded', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10, layer1_response: 'done' }, at(12, 30)), 'Responded');
});
test('status: Layer 1 missed, Layer 2 answered -> Responded', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10, layer2_response: 'ok' }, at(14)), 'Responded');
});
test('status: Layer 2 missed, Layer 3 answered -> Responded', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10, layer3_response: 'ok' }, at(16)), 'Responded');
});
test('status: a blank or whitespace response does not count as answered', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10, layer1_response: '   ' }, at(12, 30)), 'Layer 1 - 1:00 PM');
});
test('status: boundaries are inclusive (now == deadline is still that layer)', () => {
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(13, 0)), 'Layer 1 - 1:00 PM');
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(15, 0)), 'Layer 2 - 3:00 PM');
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(17, 0)), 'Layer 3 - 5:00 PM');
  assert.equal(responseWithinStatus({ submitted_at: raise10 }, at(17, 1)), 'Overdue');
});
test('status: raise 19:00 uses the next-day Layer 2 and Layer 3 deadlines', () => {
  const e = { submitted_at: dh(2026, 11, 14, 19) };
  assert.equal(responseWithinStatus(e, new Date(dh(2026, 11, 14, 19, 30))), 'Layer 1 - 8:00 PM');
  assert.equal(responseWithinStatus(e, new Date(dh(2026, 11, 15, 11, 30))), 'Layer 2 - 15 Nov 12:00 PM');
  assert.equal(responseWithinStatus(e, new Date(dh(2026, 11, 15, 12, 30))), 'Layer 3 - 15 Nov 2:00 PM');
});
