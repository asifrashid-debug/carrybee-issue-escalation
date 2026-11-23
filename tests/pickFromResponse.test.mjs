import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivedCells } from '../lib/sheets.js';

const base = { submitted_at: '2026-11-18T08:00:00Z' };

test('AG Pending when no response time', () => {
  assert.equal(derivedCells({ ...base, issue_pick_time: '2026-11-18T08:30:00Z' }, null)[0], 'Pending');
});
test('AG Within SLA when response within 2h', () => {
  assert.equal(derivedCells({ ...base, issue_response_datetime: '2026-11-18T09:59:00Z' }, null)[0], 'Within SLA');
});
test('AG Breached when response after 2h', () => {
  assert.equal(derivedCells({ ...base, issue_response_datetime: '2026-11-18T10:01:00Z' }, null)[0], 'Breached');
});
test('AG counts only office hours: raised 21:30 Dhaka, responded 11:00 next day = 1h, Within SLA', () => {
  assert.equal(derivedCells({ submitted_at: '2026-11-24T15:30:00Z', issue_response_datetime: '2026-11-25T05:00:00Z' }, null)[0], 'Within SLA');
});
test('AG office hours: raised 19:30 Dhaka, responded 12:00 next day = 2.5h, Breached', () => {
  assert.equal(derivedCells({ submitted_at: '2026-11-24T13:30:00Z', issue_response_datetime: '2026-11-25T06:00:00Z' }, null)[0], 'Breached');
});
test('AG ignores issue_pick_time', () => {
  assert.equal(derivedCells({ ...base, issue_pick_time: '2026-11-18T08:05:00Z', issue_response_datetime: '2026-11-18T12:00:00Z' }, null)[0], 'Breached');
});
