import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkFeedbackPlan, bulkBlockReason, BULK_LIMIT } from '../lib/bulkFeedback.js';

const lead = { email: 'lead-a@cb.com', role: 'team_lead', teams: ['KAM A'] };
const cmLead = { email: 'cm-lead@cb.com', role: 'cm_lead', teams: ['CM'] };
const admin = { email: 'admin@cb.com', role: 'admin' };
const scope = {
  all: false,
  user: lead,
  byEmail: new Map([['raiser@cb.com', { email: 'raiser@cb.com', role: 'requester', teams: ['KAM A'] }], ['other@cb.com', { email: 'other@cb.com', role: 'requester', teams: ['IB'] }]]),
  pickedIds: [],
};
const ok = { layer1_response: 'Hub called the rider', ops_issue_status: 'In Progress' };
const rows = [
  { issue_id: 'CB-1', email: 'raiser@cb.com', kam_feedback_status: 'Pending', ...ok },
  { issue_id: 'CB-2', email: 'raiser@cb.com', kam_feedback_status: 'Resolved', ...ok },
  { issue_id: 'CB-3', email: 'other@cb.com', kam_feedback_status: 'Pending', ...ok },
];

test('team lead: visible issues only, skips already-set outcome', () => {
  const p = bulkFeedbackPlan(lead, rows, scope, 'Resolved');
  assert.deepEqual(p.allowed.map((r) => r.issue_id), ['CB-1']);
  assert.deepEqual(p.skipped.map((s) => s.issue_id).sort(), ['CB-2', 'CB-3']);
});

test('requester and mx are refused', () => {
  const kam = { email: 'raiser@cb.com', role: 'requester', teams: ['KAM A'] };
  assert.equal(bulkFeedbackPlan(kam, rows, scope, 'Resolved').status, 403);
});

test('only Resolved or Not Resolved are accepted', () => {
  assert.equal(bulkFeedbackPlan(lead, rows, scope, 'Improper Remarks').status, 400);
});

test('cm lead and admin are allowed roles', () => {
  const cmScope = { ...scope, user: cmLead };
  assert.equal(bulkFeedbackPlan(cmLead, rows, cmScope, 'Resolved').error, undefined);
  assert.equal(bulkFeedbackPlan(admin, rows, { all: true, user: admin }, 'Resolved').error, undefined);
});

test('Resolved is blocked without a hub response for team lead and cm lead', () => {
  const noResp = { issue_id: 'CB-9', email: 'raiser@cb.com', kam_feedback_status: 'Pending', layer1_response: '  ', ops_issue_status: 'New' };
  assert.equal(bulkBlockReason(lead, noResp, scope, 'Resolved'), 'No hub response yet');
  // cm lead sees MX-raised issues, so use an MX raiser for this row
  const mxScope = { all: false, user: cmLead, byEmail: new Map([['mx@cb.com', { email: 'mx@cb.com', role: 'mx', teams: ['IB'] }]]), pickedIds: [] };
  const mxRow = { ...noResp, email: 'mx@cb.com', channel: 'MX' };
  assert.equal(bulkBlockReason(cmLead, mxRow, mxScope, 'Resolved'), 'No hub response yet');
});

test('admin is not blocked by the hub response rule', () => {
  const noResp = { issue_id: 'CB-9', email: 'raiser@cb.com', kam_feedback_status: 'Pending', layer1_response: '', ops_issue_status: 'New' };
  assert.equal(bulkBlockReason(admin, noResp, { all: true, user: admin }, 'Resolved'), null);
});

test('Resolved is blocked for Unresolved and On Hold ops status, for every role', () => {
  for (const s of ['Unresolved', 'On Hold']) {
    const r = { issue_id: 'CB-8', email: 'raiser@cb.com', kam_feedback_status: 'Pending', layer1_response: 'x', ops_issue_status: s };
    assert.equal(bulkBlockReason(lead, r, scope, 'Resolved'), `Ops status is ${s}`);
    assert.equal(bulkBlockReason(admin, r, { all: true, user: admin }, 'Resolved'), `Ops status is ${s}`);
  }
});

test('Not Resolved is not blocked by the hub response or ops status rules', () => {
  const r = { issue_id: 'CB-7', email: 'raiser@cb.com', kam_feedback_status: 'Pending', layer1_response: '', ops_issue_status: 'On Hold' };
  assert.equal(bulkBlockReason(lead, r, scope, 'Not Resolved'), null);
});

test('batch limit is 50', () => {
  assert.equal(BULK_LIMIT, 50);
});

test('plan writes nothing: inputs are not mutated', () => {
  const copy = JSON.stringify(rows);
  bulkFeedbackPlan(lead, rows, scope, 'Resolved');
  assert.equal(JSON.stringify(rows), copy);
});
