import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkFeedbackPlan } from '../lib/bulkFeedback.js';

const lead = { email: 'lead-a@cb.com', role: 'team_lead', teams: ['KAM A'] };
const scope = {
  all: false,
  user: lead,
  byEmail: new Map([['raiser@cb.com', { email: 'raiser@cb.com', role: 'requester', teams: ['KAM A'] }], ['other@cb.com', { email: 'other@cb.com', role: 'requester', teams: ['IB'] }]]),
  pickedIds: [],
};
const rows = [
  { issue_id: 'CB-1', email: 'raiser@cb.com', kam_feedback_status: 'Pending' },
  { issue_id: 'CB-2', email: 'raiser@cb.com', kam_feedback_status: 'Resolved' },
  { issue_id: 'CB-3', email: 'other@cb.com', kam_feedback_status: 'Pending' },
];

test('team lead: visible issues only, skips already-set outcome', () => {
  const p = bulkFeedbackPlan(lead, rows, scope, 'Resolved');
  assert.deepEqual(p.allowed.map((r) => r.issue_id), ['CB-1']);
  assert.deepEqual(p.skipped.map((s) => s.issue_id).sort(), ['CB-2', 'CB-3']);
});

test('non team lead is refused', () => {
  const kam = { email: 'raiser@cb.com', role: 'requester', teams: ['KAM A'] };
  assert.equal(bulkFeedbackPlan(kam, rows, scope, 'Resolved').status, 403);
});

test('only Resolved or Not Resolved are accepted', () => {
  assert.equal(bulkFeedbackPlan(lead, rows, scope, 'Improper Remarks').status, 400);
});
