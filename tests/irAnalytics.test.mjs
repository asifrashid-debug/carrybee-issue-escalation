// IR analytics rules: SLA buckets, status and KAM counts, late issues, averages, members, trend. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIrAnalytics, classifyIrSla } from '../lib/irAnalytics.mjs';

const NOW = new Date('2026-11-14T06:00:00Z'); // 12:00 Dhaka, 14 Nov
const ENV = {}; // defaults: pick 24 h, resolve from the category only

test('pick: within, breached, overdue, pending, skipped, none', () => {
  const t = (over) => classifyIrSla({ raisedIso: '2026-11-14T00:00:00Z', doneIso: null, targetHours: 24, status: 'Open', nowMs: NOW.getTime(), ...over });
  assert.equal(classifyIrSla({ raisedIso: '2026-11-14T00:00:00Z', doneIso: '2026-11-14T10:00:00Z', targetHours: 24, nowMs: NOW.getTime() }), 'within');
  assert.equal(classifyIrSla({ raisedIso: '2026-11-13T00:00:00Z', doneIso: '2026-11-14T02:00:00Z', targetHours: 24, nowMs: NOW.getTime() }), 'breached');
  assert.equal(t({ raisedIso: '2026-11-12T00:00:00Z' }), 'overdue', 'open, past 24 h, no Picked');
  assert.equal(t({}), 'pending', 'open, inside 24 h');
  assert.equal(t({ raisedIso: '2026-11-12T00:00:00Z', status: 'Resolved' }), 'skipped', 'Picked skipped, status moved on');
  assert.equal(t({ targetHours: null }), 'none');
});

test('resolve: pending while open, within when resolved in time, none without a target', () => {
  assert.equal(classifyIrSla({ raisedIso: '2026-11-13T00:00:00Z', doneIso: '2026-11-13T12:00:00Z', targetHours: 24, nowMs: NOW.getTime() }), 'within');
  assert.equal(classifyIrSla({ raisedIso: '2026-11-14T00:00:00Z', doneIso: null, targetHours: 24, nowMs: NOW.getTime() }), 'pending');
  assert.equal(classifyIrSla({ raisedIso: '2026-11-14T00:00:00Z', doneIso: '2026-11-14T01:00:00Z', targetHours: null, nowMs: NOW.getTime() }), 'none');
});

const rows = [
  { issue_id: 'A', submitted_at: '2026-11-14T00:00:00Z', ir_status: 'Picked', ir_picked_at: '2026-11-14T10:00:00Z', ir_kam_status: 'Open', ir_assigned_member: 'Fuad Hassan', ir_resolve_sla_days: 1, issue_category: 'Cash' },
  { issue_id: 'B', submitted_at: '2026-11-12T00:00:00Z', ir_status: 'Open', ir_kam_status: null, issue_category: 'Cash' },
  { issue_id: 'C', submitted_at: '2026-11-13T00:00:00Z', ir_status: 'Resolved', ir_resolved_at: '2026-11-13T12:00:00Z', ir_resolve_sla_days: 1, ir_kam_status: 'Resolved by KAM', ir_assigned_member: 'Md Al Abid', issue_category: 'Parcel' },
  { issue_id: 'D', submitted_at: '2026-11-14T03:00:00Z', ir_status: 'In Progress', ir_kam_status: 'Waiting for IR', ir_assigned_member: 'Not in list', issue_category: null },
];

test('totals, status and KAM counts, averages', () => {
  const a = buildIrAnalytics(rows, { now: NOW, env: ENV });
  assert.equal(a.total, 4);
  assert.equal(a.resolved, 1);
  assert.equal(a.open, 3);
  assert.deepEqual(a.ir_status.map((s) => [s.label, s.value]), [['Open', 1], ['Picked', 1], ['In Progress', 1], ['Resolved', 1]]);
  assert.deepEqual(a.kam_status.map((s) => [s.label, s.value]), [['Open', 1], ['Waiting for IR', 1], ['Resolved by KAM', 1], ['Not set', 1]]);
  assert.equal(a.avg_pick_hours, 10);
  assert.equal(a.avg_resolve_hours, 12);
  assert.equal(a.pick_target_hours, 24);
});

test('SLA buckets and late issues (each issue counted once)', () => {
  const a = buildIrAnalytics(rows, { now: NOW, env: ENV });
  assert.equal(a.pick.within, 1);   // A
  assert.equal(a.pick.overdue, 1);  // B: open 54 h, no Picked
  assert.equal(a.pick.skipped, 2);  // C (Resolved, no Picked), D (In Progress, no Picked)
  assert.equal(a.pick.pending, 0);
  assert.equal(a.resolve.within, 1); // C
  assert.equal(a.resolve.pending, 1); // A: open, 24 h target, 14 h elapsed (raised 00:00 UTC)
  assert.equal(a.resolve.none, 2);   // B and D have no category SLA and no env default
  assert.equal(a.late, 1, 'only B is late');
});

test('members: known names, unassigned bucket, late count per member', () => {
  const a = buildIrAnalytics(rows, { now: NOW, env: ENV });
  const by = Object.fromEntries(a.members.map((m) => [m.name, m]));
  assert.equal(by['Fuad Hassan'].assigned, 1);
  assert.equal(by['Md Al Abid'].resolved, 1);
  assert.equal(by['Not assigned'].assigned, 2, 'B (no member) and D (name not in list)');
  assert.equal(by['Not assigned'].late, 1, 'B is late');
  assert.equal(a.members.some((m) => m.name === 'Md Saidul Islam Siam' && m.assigned === 0), true, 'known members listed even with 0');
});

test('categories: sorted by count, blank becomes Not set', () => {
  const a = buildIrAnalytics(rows, { now: NOW, env: ENV });
  assert.deepEqual(a.categories.map((c) => [c.label, c.value]), [['Cash', 2], ['Parcel', 1], ['Not set', 1]]);
});

test('trend: one point per Dhaka day, ending on the range end', () => {
  const a = buildIrAnalytics(rows, { now: NOW, range: { key: '7d', from: '2026-11-08', to: '2026-11-14' }, env: ENV });
  assert.deepEqual(a.trend.labels, ['11-08', '11-09', '11-10', '11-11', '11-12', '11-13', '11-14']);
  assert.deepEqual(a.trend.values, [0, 0, 0, 0, 1, 1, 2]);
});

test('All time trend covers 14 days ending today (Dhaka)', () => {
  const a = buildIrAnalytics([], { now: NOW, env: ENV });
  assert.equal(a.trend.labels.length, 14);
  assert.equal(a.trend.labels[13], '11-14');
  assert.equal(a.total, 0);
  assert.equal(a.avg_pick_hours, null);
});

test('IR resolve target uses the env default when the category has no days', () => {
  const r = [{ issue_id: 'E', submitted_at: '2026-11-13T00:00:00Z', ir_status: 'Resolved', ir_resolved_at: '2026-11-13T20:00:00Z', ir_resolve_sla_days: null }];
  assert.equal(buildIrAnalytics(r, { now: NOW, env: { IR_RESOLVE_SLA_HOURS: '12' } }).resolve.breached, 1);
  assert.equal(buildIrAnalytics(r, { now: NOW, env: {} }).resolve.none, 1);
});
