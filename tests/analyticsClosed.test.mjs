import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnalytics } from '../lib/analytics.js';

const now = new Date('2026-11-14T06:00:00Z');
const base = { submitted_at: '2026-11-14T00:00:00Z', email: 'a@x', zone: 'ISD', concern_hub: 'Uttara', issue_status: 'Open', priority_scale: 'P3', ops_issue_status: 'New', channel: 'KAM', kam_feedback_status: 'Pending' };

test('funnel Resolved counts ops Resolved or Closed issues', () => {
  const rows = [
    { ...base, issue_id: 'A', issue_status: 'Closed', kam_feedback_status: 'Resolved', ops_issue_status: 'New' },
    { ...base, issue_id: 'B', issue_status: 'Open', ops_issue_status: 'Resolved' },
    { ...base, issue_id: 'C', issue_status: 'Open', ops_issue_status: 'Picked' },
  ];
  const r = computeAnalytics({ escalations: rows, now });
  assert.equal(r.kpi.resolved, 1);          // ops Resolved only (unchanged KPI)
  assert.equal(r.kpi.funnelResolved, 2);    // ops Resolved + Closed
  assert.equal(r.kpi.closed, 1);
});

test('feedback outcomes read kam_feedback_status of closed issues', () => {
  const rows = [
    { ...base, issue_id: 'A', issue_status: 'Closed', kam_feedback_status: 'Resolved' },
    { ...base, issue_id: 'B', issue_status: 'Closed', kam_feedback_status: 'Not Resolved' },
    { ...base, issue_id: 'C', issue_status: 'Open', kam_feedback_status: 'Resolved' },
  ];
  const r = computeAnalytics({ escalations: rows, now });
  const item = (l) => r.feedbackOutcomes.items.find((i) => i.label === l);
  assert.equal(r.feedbackOutcomes.closed, 2);
  assert.equal(item('Resolved').count, 1);
  assert.equal(item('Not Resolved').count, 1);
  assert.equal(item('No feedback yet').count, 0);
});
