// CM owner: round-robin assignment at raise, and CM picked only for the assigned CM member (CM lead and admin too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCmOwner } from '../lib/cmAssign.js';
import { canPick } from '../lib/roles.js';
import { cmPickBlock } from '../lib/pickSla.js';

const TANZIM = 'tanzim@x', NAHID = 'nahid@x', ZED = 'zed@x';
const cmMember = (email) => ({ email, role: 'cm_member', teams: ['CM'] });
const cmLead = { email: 'asif@x', role: 'cm_lead', teams: ['CM'] };
const admin = { email: 'admin@x', role: 'admin', teams: [] };
const issue = (owner, extra = {}) => ({ issue_id: 'CB-9', email: 'mafi@x', channel: 'MX', kam_name: 'CM', cm_assigned: true, cm_owner_email: owner, business_pick_time: null, ...extra });

test('round-robin: no members gives no owner', () => {
  assert.equal(nextCmOwner([], null), null);
});

test('round-robin: first issue goes to the first member by email', () => {
  assert.equal(nextCmOwner([ZED, TANZIM, NAHID], null), NAHID); // sorted: nahid, tanzim, zed -> first is nahid
  assert.equal(nextCmOwner([TANZIM, NAHID], null), NAHID);
});

test('round-robin: each next issue goes to the next member, wrapping around', () => {
  const members = [TANZIM, NAHID];
  const a = nextCmOwner(members, null);      // nahid
  const b = nextCmOwner(members, a);         // tanzim
  const c = nextCmOwner(members, b);         // nahid again
  assert.deepEqual([a, b, c], [NAHID, TANZIM, NAHID]);
});

test('round-robin: a removed last owner restarts at the first member', () => {
  assert.equal(nextCmOwner([TANZIM, NAHID], 'gone@x'), NAHID);
});

test('round-robin: duplicate and blank emails are ignored', () => {
  assert.equal(nextCmOwner([TANZIM, '', TANZIM, null], null), TANZIM);
});

test('CM picked: only the assigned CM member, the CM lead and admin', () => {
  const i = issue(TANZIM);
  assert.equal(canPick(cmMember(TANZIM), i), true);
  assert.equal(canPick(cmMember(NAHID), i), false);
  assert.equal(canPick(cmLead, i), true);
  assert.equal(canPick(admin, i), true);
});

test('CM picked: server agrees with the button', () => {
  const i = issue(TANZIM);
  assert.equal(cmPickBlock(cmMember(TANZIM), i), null);
  assert.equal(cmPickBlock(cmMember(NAHID), i).status, 403);
  assert.equal(cmPickBlock(cmLead, i), null);
  assert.equal(cmPickBlock(admin, i), null);
});

test('no owner yet: CM members cannot pick, CM lead and admin can', () => {
  const i = issue(null);
  assert.equal(canPick(cmMember(TANZIM), i), false);
  assert.equal(cmPickBlock(cmMember(TANZIM), i).status, 403);
  assert.equal(canPick(cmLead, i), true);
});

test('already picked: nobody can press it again', () => {
  const i = issue(TANZIM, { business_pick_time: '2026-11-18T05:58:00Z' });
  assert.equal(canPick(cmMember(TANZIM), i), false);
  assert.equal(cmPickBlock(cmMember(TANZIM), i).status, 400);
});

import { canJustifyPick, pickWriteBlock } from '../lib/pickSla.js';
import { cmNoticeRows } from '../lib/notify.js';

test('missed-pick justification: only the assigned CM member, the CM lead and admin', () => {
  const late = issue(TANZIM, { pick_due_at: '2026-11-18T05:00:00Z', pick_justify_due_at: '2026-11-19T05:00:00Z', business_pick_time: '2026-11-18T06:00:00Z', pick_justifications: 0 });
  const now = new Date('2026-11-18T06:30:00Z');
  assert.equal(canJustifyPick(cmMember(TANZIM), late), true);
  assert.equal(canJustifyPick(cmMember(NAHID), late), false);
  assert.equal(canJustifyPick(cmLead, late), true);
  assert.equal(canJustifyPick(admin, late), true);
  assert.equal(pickWriteBlock(cmMember(TANZIM), late, now), null);
  assert.equal(pickWriteBlock(cmMember(NAHID), late, now).status, 403);
});

test('bell for a new CM issue goes to the assigned member only', () => {
  const users = [{ email: TANZIM, role: 'cm_member' }, { email: NAHID, role: 'cm_member' }, { email: 'asif@x', role: 'cm_lead' }];
  assert.deepEqual(cmNoticeRows({ issue_id: 'CB-7', cm_assigned: true, cm_owner_email: NAHID }, users).map((r) => r.recipient_email), [NAHID]);
});
