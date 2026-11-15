import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnalytics } from '../lib/analytics.js';

const now = new Date('2026-11-14T06:00:00Z');
const hoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();
const row = (over) => ({ submitted_at: hoursAgo(1), issue_status: 'Open', ops_issue_status: null, zone: 'ISD', priority_scale: 'P3', concern_hub: 'Uttara', ...over });

test('ageing buckets count open cases by whole days since submission', () => {
  const escalations = [
    row({ submitted_at: hoursAgo(5) }),        // 0 days -> 0–1
    row({ submitted_at: hoursAgo(30) }),       // 1 day  -> 0–1
    row({ submitted_at: hoursAgo(49) }),       // 2 days -> 2–4
    row({ submitted_at: hoursAgo(4 * 24 + 5) },),   // 4 days -> 2–4
    row({ submitted_at: hoursAgo(5 * 24 + 1) }),    // 5 days -> 5+
    row({ submitted_at: hoursAgo(30), issue_status: 'Closed' }), // closed: not aged
  ];
  const { ageing, kpi } = computeAnalytics({ escalations, now });
  assert.deepEqual(ageing.map((a) => a.count), [2, 2, 1]);
  assert.equal(ageing.reduce((n, a) => n + a.count, 0), kpi.open);
});

test('feedback outcomes are shares of closed cases, with no-feedback as the remainder', () => {
  const escalations = [
    row({ issue_status: 'Closed', kam_feedback_status: 'Resolved' }),
    row({ issue_status: 'Closed', kam_feedback_status: 'Resolved' }),
    row({ issue_status: 'Closed', kam_feedback_status: 'Not Resolved' }),
    row({ issue_status: 'Closed', kam_feedback_status: 'Pending' }),
    row({ issue_status: 'Open', kam_feedback_status: 'Resolved' }), // open: ignored
  ];
  const { feedbackOutcomes } = computeAnalytics({ escalations, now });
  assert.equal(feedbackOutcomes.closed, 4);
  const byLabel = Object.fromEntries(feedbackOutcomes.items.map((i) => [i.label, i]));
  assert.equal(byLabel['Resolved'].count, 2);
  assert.equal(byLabel['Resolved'].pct, 50);
  assert.equal(byLabel['Not Resolved'].pct, 25);
  assert.equal(byLabel['Improper Remarks'].count, 0);
  assert.equal(byLabel['No feedback yet'].count, 1);
  assert.equal(byLabel['No feedback yet'].pct, 25);
});

test('no closed cases gives null shares, not a division error', () => {
  const { feedbackOutcomes } = computeAnalytics({ escalations: [row({})], now });
  assert.equal(feedbackOutcomes.closed, 0);
  assert.ok(feedbackOutcomes.items.every((i) => i.pct === null));
});
