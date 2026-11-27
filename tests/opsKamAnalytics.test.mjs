import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOpsKam, forViewer } from '../lib/opsKamAnalytics.mjs';
import { TABS } from '../lib/access.js';

const MIN = 60e3;
const HOUR = 3600e3;
const NOW = new Date('2026-11-22T10:00:00Z');
const at = (ms) => new Date(NOW.getTime() + ms).toISOString();
const SID = { ISD: 'sid-isd', OSD: 'sid-osd', CTG: 'sid-ctg' };
const zoneOf = (sid) => Object.keys(SID).find((z) => SID[z] === sid) || null;

// Raised ms before NOW. Fields default to an open, unpicked issue.
// Windows are derived from raised_at, as the sync does (30 min pick, 24 h close).
const issue = (over = {}) => {
  const raised = over.raised_at === undefined ? at(-10 * MIN) : over.raised_at;
  const t = new Date(raised).getTime();
  return {
    issue_id: 'CB-22-11-0001', kam_name: 'Sample KAM', issue_category: 'Payment', sheet_spreadsheet_id: SID.ISD,
    issue_status: 'Raised', validation: null, validated_at: null, raised_at: raised,
    pick_due_at: new Date(t + 30 * MIN).toISOString(), resolve_due_at: new Date(t + 24 * HOUR).toISOString(),
    picked_at: null, closed_at: null,
    ...over,
  };
};
const run = (rows, extra = {}) => computeOpsKam({ issues: rows, now: NOW, days: 3, zoneOf, ...extra });

test('empty input gives zeros and nulls, not NaN', () => {
  const r = run([]);
  assert.equal(r.total, 0);
  assert.equal(r.pickOnTimePct, null);
  assert.equal(r.closeOnTimePct, null);
  assert.equal(r.medianPickMinutes, null);
  assert.equal(r.validatedPct, null);
  assert.equal(r.trend.length, 3);
});

test('rows with no raise time are ignored', () => {
  const r = run([issue({ raised_at: null }), issue()]);
  assert.equal(r.total, 1);
});

test('counts: open, to pick, closed, and overdue (open past a window)', () => {
  const rows = [
    issue({ issue_id: 'a' }),                                                       // Raised, 10 min old: to pick, not overdue
    issue({ issue_id: 'b', raised_at: at(-2 * HOUR) }),                             // Raised 2 h ago: pick overdue
    issue({ issue_id: 'c', issue_status: 'Resolved', picked_at: at(-100 * MIN), closed_at: at(-MIN), raised_at: at(-120 * MIN) }),
  ];
  const r = run(rows);
  assert.equal(r.total, 3);
  assert.equal(r.open, 2);
  assert.equal(r.toPick, 2);
  assert.equal(r.closed, 1);
  assert.equal(r.overdue, 1);
});

test('pick on time: picked within 30 min of Raised counts as met; late does not', () => {
  const rows = [
    issue({ issue_id: 'on', issue_status: 'Picked', picked_at: at(-10 * MIN), raised_at: at(-20 * MIN) }),   // 10 min
    issue({ issue_id: 'late', issue_status: 'Picked', picked_at: at(-MIN), raised_at: at(-50 * MIN) }),     // 49 min
    issue({ issue_id: 'none', issue_status: 'Raised' }),                                                    // not picked: excluded
  ];
  const r = run(rows);
  assert.equal(r.pickOnTimePct, 50);
  assert.equal(r.medianPickMinutes, 30);   // median of 10 and 49 is 29.5, rounded to 30
});

test('close on time: closed within 24 h of Raised counts as met', () => {
  const rows = [
    issue({ issue_id: 'ok', issue_status: 'Resolved', picked_at: at(-HOUR), closed_at: at(-MIN), raised_at: at(-3 * HOUR) }),          // 3 h
    issue({ issue_id: 'late', issue_status: 'Not Resolved', picked_at: at(-HOUR), closed_at: at(-MIN), raised_at: at(-30 * HOUR) }),   // 29.98 h
  ];
  const r = run(rows);
  assert.equal(r.closeOnTimePct, 50);
  assert.equal(r.medianCloseHours, 16.5);
});

test('validation: the four values, unknown and blank values count as Not validated', () => {
  const rows = [
    issue({ issue_id: '1', validation: 'Valid', validated_at: at(-MIN) }),
    issue({ issue_id: '2', validation: 'Duplicate', validated_at: at(-MIN) }),
    issue({ issue_id: '3', validation: 'Something else' }),
    issue({ issue_id: '4', validation: null }),
  ];
  const r = run(rows);
  const by = Object.fromEntries(r.validations.map((v) => [v.label, v.count]));
  assert.deepEqual(by, { Valid: 1, Invalid: 0, Duplicate: 1, 'No proper info': 0, 'Not validated': 2 });
  assert.equal(r.validatedPct, 50);
});

test('status counts follow the lifecycle order', () => {
  const r = run([issue({ issue_status: 'In Progress', picked_at: at(-MIN) }), issue({ issue_id: 'x' })]);
  assert.deepEqual(r.statuses.map((s) => s.label), ['Raised', 'Picked', 'In Progress', 'Resolved', 'Not Resolved']);
  assert.equal(r.statuses.find((s) => s.label === 'In Progress').count, 1);
  assert.equal(r.statuses.find((s) => s.label === 'Raised').count, 1);
});

test('zones come from the sheet id; an unknown sheet is Unknown', () => {
  const rows = [
    issue({ issue_id: '1', sheet_spreadsheet_id: SID.ISD }),
    issue({ issue_id: '2', sheet_spreadsheet_id: SID.OSD }),
    issue({ issue_id: '3', sheet_spreadsheet_id: 'other' }),
  ];
  const r = run(rows);
  assert.deepEqual(r.zones.map((z) => z.zone).sort(), ['ISD', 'OSD', 'Unknown']);
});

test('categories: blank is Not categorised; sorted by count', () => {
  const rows = [issue({ issue_id: '1', issue_category: '' }), issue({ issue_id: '2', issue_category: null }), issue({ issue_id: '3', issue_category: 'Payment' })];
  const r = run(rows);
  assert.deepEqual(r.categories[0], { label: 'Not categorised', count: 2 });
  assert.deepEqual(r.categories[1], { label: 'Payment', count: 1 });
});

test('per KAM: blank name becomes No KAM, each KAM has its own on-time figures', () => {
  const rows = [
    issue({ issue_id: '1', kam_name: 'Rahim', issue_status: 'Picked', picked_at: at(-10 * MIN), raised_at: at(-15 * MIN) }),
    issue({ issue_id: '2', kam_name: 'Rahim', issue_status: 'Picked', picked_at: at(-MIN), raised_at: at(-60 * MIN) }),
    issue({ issue_id: '3', kam_name: '' }),
  ];
  const r = run(rows);
  const rahim = r.kams.find((k) => k.kam === 'Rahim');
  assert.equal(rahim.total, 2);
  assert.equal(rahim.pickOnTimePct, 50);
  assert.ok(r.kams.find((k) => k.kam === 'No KAM'));
});

test('trend: last N Dhaka days ending today; raised and closed counted on their own days', () => {
  const rows = [
    issue({ issue_id: '1', raised_at: at(-MIN) }),                                              // today
    issue({ issue_id: '2', issue_status: 'Resolved', picked_at: at(-HOUR), closed_at: at(-MIN), raised_at: at(-2 * HOUR) }),
  ];
  const r = run(rows);
  assert.equal(r.trend.length, 3);
  const last = r.trend[r.trend.length - 1];
  assert.equal(last.date, '2026-11-22');
  assert.equal(last.raised, 2);
  assert.equal(last.closed, 1);
});

test('only admin keeps per-KAM detail', () => {
  const r = run([issue()]);
  assert.ok(forViewer(r, 'admin').kams);
  assert.equal(forViewer(r, 'team_lead').kams, undefined);
  assert.equal(forViewer(r, 'cm_lead').kams, undefined);
  assert.equal(forViewer(r, 'team_lead').total, 1);   // aggregates stay
});

test('the Ops-KAM tab is named OPS-KAM Tracker', () => {
  const tab = TABS.find((t) => t.tab === 'kam_issues');
  assert.equal(tab.label, 'OPS-KAM Tracker');
  assert.equal(tab.href, '/kam/issues');
});
