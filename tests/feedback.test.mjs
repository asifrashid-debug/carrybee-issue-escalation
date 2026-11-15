import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackPhase, feedbackWriteBlock, isFeedbackOwner, windowEndFrom } from '../lib/feedback.js';

const H = 3600e3;
const raised = new Date('2026-11-14T04:00:00Z');
const base = (over = {}) => ({ issue_id: 'ESC-1', email: 'kam@carrybee.com', channel: 'KAM', kam_name: 'Kam One', kam_feedback_status: 'Pending', feedback_due_at: windowEndFrom(raised), feedback_justifications: 0, ...over });
const at = (h) => new Date(raised.getTime() + h * H);
const kam = { email: 'kam@carrybee.com', role: 'requester', display_name: 'Kam One' };
const other = { email: 'x@carrybee.com', role: 'requester', display_name: 'Someone' };
const cm = { email: 'cm@carrybee.com', role: 'cm_member', display_name: 'CM Person' };
const lead = { email: 'lead@carrybee.com', role: 'team_lead', teams: ['A'], display_name: 'Lead' };

test('new issue is Pending with a 24h window', () => {
  const e = base();
  assert.equal(feedbackPhase(e, at(1)), 'pending');
  assert.equal(new Date(e.feedback_due_at).getTime() - raised.getTime(), 24 * H);
});

test('after 24h without feedback a justification is due, then escalates after two', () => {
  assert.equal(feedbackPhase(base(), at(25)), 'justification_due');
  assert.equal(feedbackPhase(base({ feedback_justifications: 1, feedback_due_at: windowEndFrom(at(25)) }), at(40)), 'pending');
  assert.equal(feedbackPhase(base({ feedback_justifications: 1, feedback_due_at: windowEndFrom(at(25)) }), at(50)), 'justification_due');
  assert.equal(feedbackPhase(base({ feedback_justifications: 2, feedback_due_at: windowEndFrom(at(50)) }), at(80)), 'escalated');
});

test('given feedback ends the cycle', () => {
  assert.equal(feedbackPhase(base({ kam_feedback_status: 'Resolved' }), at(100)), 'provided');
});

test('owner rules: raising KAM, named KAM on MX issue, CM role while unassigned', () => {
  assert.equal(isFeedbackOwner(kam, base()), true);
  assert.equal(isFeedbackOwner(other, base()), false);
  const mxIssue = base({ channel: 'MX', email: 'mx@carrybee.com', kam_name: 'CM Person' });
  assert.equal(isFeedbackOwner(cm, mxIssue), true);
  assert.equal(isFeedbackOwner(other, mxIssue), false);
  const unassigned = base({ channel: 'MX', email: 'mx@carrybee.com', kam_name: 'CM' });
  assert.equal(isFeedbackOwner(cm, unassigned), true);
  assert.equal(isFeedbackOwner({ email: 'h@x', role: 'hub_ops', display_name: 'Kam One' }, base()), false);
});

test('write block: outcome must be one of the three', () => {
  assert.equal(feedbackWriteBlock(kam, base(), 'Merchant Confirmed', null, at(1)).status, 400);
  assert.equal(feedbackWriteBlock(kam, base(), 'Not Resolved', null, at(1)), null);
  assert.equal(feedbackWriteBlock(kam, base(), 'Improper Remarks', null, at(1)), null);
});

test('write block: justification first, then owner only, then Team Lead after failure', () => {
  assert.equal(feedbackWriteBlock(kam, base(), 'Resolved', null, at(25)).status, 409);
  assert.equal(feedbackWriteBlock(other, base(), 'Resolved', null, at(1)).status, 403);
  const failed = base({ feedback_justifications: 2, feedback_due_at: windowEndFrom(at(50)) });
  assert.equal(feedbackWriteBlock(kam, failed, 'Resolved', null, at(80)).status, 403);
  assert.equal(feedbackWriteBlock(lead, failed, 'Resolved', { email: 'kam@carrybee.com', role: 'requester', teams: ['A'] }, at(80)), null);
});
