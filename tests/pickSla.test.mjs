import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDeadline, pickPhase, pickBlock, canJustifyPick, pickWriteBlock, pickJustifyDueFrom, cmCanSee } from '../lib/pickSla.js';

const raised = new Date('2026-11-14T04:00:00Z');
const m = (n) => new Date(raised.getTime() + n * 60e3);
const cm = { email: 'cm@carrybee.com', role: 'cm_member', teams: ['CM'], display_name: 'CM One' };
const cmLead = { email: 'lead@carrybee.com', role: 'cm_lead', teams: ['CM'] };
const kam = { email: 'kam@carrybee.com', role: 'requester' };
const mxRow = { email: 'mx@carrybee.com', role: 'mx', teams: [] };
const base = (over = {}) => ({ cm_assigned: true, priority_scale: 'P1', submitted_at: raised.toISOString(), pick_due_at: pickDeadline(raised, 'P1'), pick_justifications: 0, pick_justify_due_at: pickJustifyDueFrom(pickDeadline(raised, 'P1')), issue_pick_time: null, ...over });

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
  assert.equal(pickPhase(base({ issue_pick_time: m(9).toISOString() }), m(30)), 'met');
});

test('unpicked before the deadline is pending', () => {
  assert.equal(pickPhase(base(), m(5)), 'pending');
});

test('unpicked past the deadline needs a justification', () => {
  assert.equal(pickPhase(base(), m(11)), 'justification_due');
});

test('picked late needs a justification, even after pick', () => {
  assert.equal(pickPhase(base({ issue_pick_time: m(12).toISOString() }), m(13)), 'justification_due');
});

test('two justifications then justified', () => {
  const after1 = base({ pick_justifications: 1, pick_justify_due_at: pickJustifyDueFrom(m(20)) });
  assert.equal(pickPhase(after1, m(30)), 'justification_due');
  const after2 = base({ pick_justifications: 2, pick_justify_due_at: null });
  assert.equal(pickPhase(after2, m(3000)), 'justified');
});

test('no justification in its window -> escalated to CM lead', () => {
  assert.equal(pickPhase(base(), new Date(raised.getTime() + 25 * 3600e3)), 'escalated');
  assert.equal(pickWriteBlock(cm, base(), new Date(raised.getTime() + 25 * 3600e3)).status, 409);
});

test('pick and justify permissions: CM members, CM lead and admin only', () => {
  assert.equal(pickBlock(cm, base()), null);
  assert.equal(pickBlock(cmLead, base()), null);
  assert.equal(pickBlock({ role: 'admin' }, base()), null);
  assert.equal(pickBlock(kam, base()).status, 403);
  assert.equal(canJustifyPick(cm, base()), true);
  assert.equal(canJustifyPick(kam, base()), false);
});

test('CM members see the unpicked CM pool, their own picks and their own issues only', () => {
  const pool = { email: 'mx@carrybee.com', cm_assigned: true, issue_pick_time: null };
  const picked = { email: 'mx@carrybee.com', cm_assigned: true, issue_pick_time: '2026-11-14T04:05:00Z' };
  assert.equal(cmCanSee(cm, pool, mxRow), true);
  assert.equal(cmCanSee(cm, picked, mxRow), false);
  assert.equal(cmCanSee(cm, { ...picked, issue_id: 'ESC-1' }, mxRow, true), true); // picked by this member
  assert.equal(cmCanSee(cm, { email: cm.email, cm_assigned: false }, null), true); // own issue
});
