import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDeadline, pickPhase, pickBlock, canJustifyPick, pickWriteBlock, pickJustifyDueFrom, cmCanSee } from '../lib/pickSla.js';

const raised = new Date('2026-11-14T04:00:00Z');
const m = (n) => new Date(raised.getTime() + n * 60e3);
const cm = { email: 'cm@carrybee.com', role: 'cm_member', teams: ['CM'], display_name: 'CM One' };
const cmLead = { email: 'lead@carrybee.com', role: 'cm_lead', teams: ['CM'] };
const kam = { email: 'kam@carrybee.com', role: 'requester' };
const mxRow = { email: 'mx@carrybee.com', role: 'mx', teams: [] };
const base = (over = {}) => ({ cm_assigned: true, priority_scale: 'P1', submitted_at: raised.toISOString(), pick_due_at: pickDeadline(raised, 'P1'), pick_justifications: 0, pick_justify_due_at: pickJustifyDueFrom(pickDeadline(raised, 'P1')), business_pick_time: null, ...over });

test('deadlines: P1 10 min, P2 15 min, P3 20 min, P4 20 min', () => {
  assert.equal(new Date(pickDeadline(raised, 'P1')) - raised, 10 * 60e3);
  assert.equal(new Date(pickDeadline(raised, 'P2')) - raised, 15 * 60e3);
  assert.equal(new Date(pickDeadline(raised, 'P3')) - raised, 20 * 60e3);
  assert.equal(new Date(pickDeadline(raised, 'P4')) - raised, 20 * 60e3);
  assert.equal(pickDeadline(raised, 'X'), null);
});

test('not CM-assigned issues have no pick SLA', () => {
  assert.equal(pickPhase({ cm_assigned: false }, m(60)), 'n/a');
  assert.equal(pickBlock(kam, { cm_assigned: false }), null);
});

test('picked on time is met, no justification', () => {
  assert.equal(pickPhase(base({ business_pick_time: m(9).toISOString() }), m(30)), 'met');
});

test('unpicked before the deadline is pending', () => {
  assert.equal(pickPhase(base(), m(5)), 'pending');
});

test('unpicked past the deadline needs a justification', () => {
  assert.equal(pickPhase(base(), m(11)), 'justification_due');
});

test('picked late needs a justification, even after pick', () => {
  assert.equal(pickPhase(base({ business_pick_time: m(12).toISOString() }), m(13)), 'justification_due');
});

test('two justifications then justified', () => {
  const after1 = base({ pick_justifications: 1, pick_justify_due_at: pickJustifyDueFrom(m(20)) });
  assert.equal(pickPhase(after1, m(30)), 'justification_due');
  const after2 = base({ pick_justifications: 2, pick_justify_due_at: null });
  assert.equal(pickPhase(after2, m(3000)), 'justified');
});

test('no justification in its window -> escalated to CM lead', () => {
  assert.equal(pickPhase(base(), new Date(raised.getTime() + 25 * 3600e3)), 'escalated');
  assert.equal(pickWriteBlock(cm, base({ cm_owner_email: cm.email }), new Date(raised.getTime() + 25 * 3600e3)).status, 409);
  assert.equal(pickWriteBlock(cm, base({ cm_owner_email: 'other@carrybee.com' }), new Date(raised.getTime() + 25 * 3600e3)).status, 403);
});

test('pick and justify permissions: CM members, CM lead and admin only', () => {
  assert.equal(pickBlock(cm, base()), null);
  assert.equal(pickBlock(cmLead, base()), null);
  assert.equal(pickBlock({ role: 'admin' }, base()), null);
  assert.equal(pickBlock(kam, base()).status, 403);
  assert.equal(canJustifyPick(cm, base({ cm_owner_email: cm.email })), true);
  assert.equal(canJustifyPick(cm, base({ cm_owner_email: 'other@carrybee.com' })), false);
  assert.equal(canJustifyPick(kam, base()), false);
});

test('CM members see all MX-channel issues and issues named CM, plus their own issues', () => {
  const mxPool = { email: 'mx@carrybee.com', channel: 'MX', kam_name: 'CM', cm_assigned: true, business_pick_time: null };
  const mxPicked = { ...mxPool, business_pick_time: '2026-11-14T04:05:00Z' };
  const kamOther = { email: 'req@carrybee.com', channel: 'KAM', kam_name: 'Someone', cm_assigned: false };
  assert.equal(cmCanSee(cm, mxPool, mxRow), true);
  assert.equal(cmCanSee(cm, mxPicked, mxRow), true);
  assert.equal(cmCanSee(cm, kamOther, kam), false);
  assert.equal(cmCanSee(cm, { email: cm.email, cm_assigned: false }, null), true); // own issue
});

// CM picked (server check): CM-assigned only, CM roles or admin, set once.
import { cmPickBlock } from '../lib/pickSla.js';
test('cmPickBlock: CM members pick CM-assigned issues once; others and normal issues are refused', () => {
  // Only the assigned CM member may pick a CM member's issue. The fixture names the owner.
  const open = { cm_assigned: true, business_pick_time: null, cm_owner_email: 'cm@x' };
  assert.equal(cmPickBlock({ role: 'cm_member', email: 'cm@x' }, open), null);
  assert.equal(cmPickBlock({ role: 'cm_member', email: 'other@x' }, open).status, 403);
  assert.equal(cmPickBlock({ role: 'cm_member' }, open).status, 403);
  assert.equal(cmPickBlock({ role: 'cm_lead' }, open), null);
  assert.equal(cmPickBlock({ role: 'admin' }, open), null);
  assert.equal(cmPickBlock({ role: 'mx' }, open).status, 403);
  assert.equal(cmPickBlock({ role: 'cm_member', email: 'cm@x' }, { cm_assigned: false, business_pick_time: null }).status, 409);
  assert.equal(cmPickBlock({ role: 'cm_member', email: 'cm@x' }, { ...open, business_pick_time: '2026-11-18T09:00:00Z' }).status, 400);
});
