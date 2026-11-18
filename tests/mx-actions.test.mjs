// MX users: raise and view only. No KAM feedback, CM picked or follow-ups.
// CM picked: only MX issues whose KAM name is CM, for CM members, CM leads and admin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPick } from '../lib/roles.js';
import { isFeedbackOwner, feedbackWriteBlock, feedbackView } from '../lib/feedback.js';
import { pickView, cmPickBlock, pickBlock, canJustifyPick } from '../lib/pickSla.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const mx = { email: 'mafi@x', role: 'mx', teams: ['IB'], display_name: 'Md Mojahidul Islam Mafi' };
const cmMember = { email: 'tanzim@x', role: 'cm_member', teams: ['CM'], display_name: 'Tanzim Iniat Islam' };
const cmLead = { email: 'asif@x', role: 'cm_lead', teams: ['CM'], display_name: 'Ahmed Asif Rashid' };
const admin = { email: 'admin@x', role: 'admin', teams: [] };
const kam = { email: 'anik@x', role: 'requester', teams: ['KAM'], display_name: 'Md. Anik Ahamed' };

// MX issue raised by the MX user, KAM name CM (CM-assigned), not yet picked
const cmIssue = {
  issue_id: 'CB-1', email: 'mafi@x', channel: 'MX', kam_name: 'CM', cm_assigned: true, cm_owner_email: 'tanzim@x',
  business_pick_time: null, pick_due_at: '2026-11-18T06:10:00Z', submitted_at: '2026-11-18T05:55:00Z',
  priority_scale: 'P2', kam_feedback_status: 'Pending', feedback_due_at: '2026-11-19T05:55:00Z', feedback_justifications: 0,
};
// MX issue naming a KAM (not CM): feedback owner is the named KAM
const namedMxIssue = { ...cmIssue, issue_id: 'CB-2', kam_name: 'Md. Anik Ahamed', cm_assigned: false, business_pick_time: '2026-11-18T05:56:00Z' };
// KAM-channel issue with KAM name CM (not an MX issue, so not CM-assigned)
const kamCmIssue = { ...cmIssue, issue_id: 'CB-3', channel: 'KAM', email: 'anik@x', cm_assigned: false, business_pick_time: '2026-11-18T05:56:00Z' };

test('MX: not a feedback owner, even on an issue naming their name', () => {
  assert.equal(isFeedbackOwner(mx, namedMxIssue), false);
  assert.equal(isFeedbackOwner(mx, cmIssue), false);
});

test('MX: feedback write is refused and the drawer gets no feedback section', () => {
  assert.equal(feedbackWriteBlock(mx, namedMxIssue, 'Resolved', null, NOW).status, 403);
  assert.equal(feedbackView(mx, namedMxIssue, [], null, NOW), null);
});

test('MX: no CM picked button and no pick section; server refuses the pick', () => {
  assert.equal(canPick(mx, cmIssue), false);
  assert.equal(pickView(mx, cmIssue, [], NOW), null);
  assert.equal(cmPickBlock(mx, cmIssue).status, 403);
  assert.equal(pickBlock(mx, cmIssue).status, 403);
  assert.equal(canJustifyPick(mx, cmIssue), false);
});

test('CM pick button opens only on MX issues with KAM name CM, not yet picked', () => {
  assert.equal(canPick(cmMember, cmIssue), true, 'assigned CM member');
  assert.equal(canPick({ ...cmMember, email: 'nahid@x' }, cmIssue), false, 'other CM member');
  assert.equal(canPick(cmLead, cmIssue), true);
  assert.equal(canPick(admin, cmIssue), true);
  assert.equal(canPick(kam, cmIssue), false, 'KAM users cannot pick');
  assert.equal(canPick(cmMember, { ...cmIssue, business_pick_time: '2026-11-18T05:58:00Z' }), false, 'already picked');
  assert.equal(canPick(cmMember, namedMxIssue), false, 'MX issue naming a KAM is not CM-assigned');
  assert.equal(canPick(cmMember, kamCmIssue), false, 'KAM-channel issue is not MX');
});

test('CM pick: pick block agrees with the button for CM members and leads', () => {
  assert.equal(cmPickBlock(cmMember, cmIssue), null);
  assert.equal(cmPickBlock(cmLead, cmIssue), null);
  assert.equal(cmPickBlock(kam, cmIssue).status, 403);
});

test('CM members keep feedback ownership on CM-named MX issues', () => {
  assert.equal(isFeedbackOwner(cmMember, cmIssue), true);
  assert.equal(isFeedbackOwner(cmLead, cmIssue), true);
});

test('Named KAM keeps feedback ownership on their MX issue', () => {
  assert.equal(isFeedbackOwner(kam, namedMxIssue), true);
  assert.equal(feedbackWriteBlock(kam, namedMxIssue, 'Resolved', null, NOW), null);
});
