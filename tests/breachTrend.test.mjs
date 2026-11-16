import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breachTrend, breachesAt } from '../lib/analytics.js';
import { indexCategories } from '../lib/categorySla.js';

const DAY = 24 * 3600000;
const H = 3600000;
const NOW = new Date('2026-11-14T10:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const idx = indexCategories([]);

test('past SLA: now, last week, delta and 14-day spark use the same rules', () => {
  const rows = [
    // A: raised 3h ago, no first comment yet -> breach now, not yet raised a week ago
    { issue_id: 'A', submitted_at: ago(3 * H), issue_status: 'Open', ops_issue_status: null, issue_response_datetime: null, updated_at: ago(3 * H) },
    // B: raised 9 days ago, commented, 72h resolution window ended 6 days ago -> breach now only
    { issue_id: 'B', submitted_at: ago(9 * DAY), issue_status: 'Open', ops_issue_status: null, issue_response_datetime: ago(9 * DAY - H), updated_at: ago(1 * DAY) },
    // D: raised 9 days ago, closed 2 days ago, no comment -> open (and breached) a week ago, closed now
    { issue_id: 'D', submitted_at: ago(9 * DAY), issue_status: 'Closed', ops_issue_status: null, issue_response_datetime: null, updated_at: ago(2 * DAY) },
  ];
  const t = breachTrend(rows, idx, NOW, 14);
  assert.equal(t.now, 2);
  assert.equal(t.lastWeek, 1);
  assert.equal(t.delta, 1);
  assert.equal(t.daily.length, 14);
  assert.equal(t.daily[13], t.now, 'last spark point equals the live count');
});

test('an issue resolved before the reference time is not a breach then', () => {
  const rows = [
    { issue_id: 'R', submitted_at: ago(9 * DAY), issue_status: 'Open', ops_issue_status: 'Resolved', issue_response_datetime: ago(9 * DAY - H), updated_at: ago(8 * DAY) },
  ];
  assert.equal(breachesAt(rows, idx, NOW), 0);
  assert.equal(breachesAt(rows, idx, ago(7 * DAY)), 0);
});

test('an issue raised after the reference time is not counted then', () => {
  const rows = [
    { issue_id: 'N', submitted_at: ago(3 * H), issue_status: 'Open', ops_issue_status: null, issue_response_datetime: null, updated_at: ago(3 * H) },
  ];
  assert.equal(breachesAt(rows, idx, ago(7 * DAY)), 0);
  assert.equal(breachesAt(rows, idx, NOW), 1);
});
