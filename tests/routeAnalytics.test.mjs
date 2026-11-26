import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteAnalytics } from '../lib/routeAnalytics.mjs';
import { indexCategories } from '../lib/categorySla.js';

const NOW = new Date('2026-11-20T06:00:00Z');
const H = 3600e3;
const ago = (h) => new Date(NOW.getTime() - h * H).toISOString();

// Default target is 72 hours when the category has no SLA.
const rows = [
  // open, 24 h old: inside 72 h
  { issue_id: 'A', zone: 'ISD', concern_hub: 'H1', issue_category: 'Late delivery', submitted_at: ago(24), issue_status: 'Open', ops_issue_status: 'New', ops_status: 'Picked', validation: 'Valid', central_sort_sheet_row: 2, tnl_sheet_row: null },
  // open, 100 h old: past 72 h
  { issue_id: 'B', zone: 'OSD', concern_hub: 'H2', issue_category: 'Damaged', submitted_at: ago(100), issue_status: 'Open', ops_issue_status: 'In Progress', ops_status: 'In Progress', validation: null, central_sort_sheet_row: 3, tnl_sheet_row: null },
  // resolved in ops: closed, even though old
  { issue_id: 'C', zone: 'ISD', concern_hub: 'H1', issue_category: 'Damaged', submitted_at: ago(200), issue_status: 'Open', ops_issue_status: 'Resolved', ops_status: 'Resolved', validation: 'Valid', central_sort_sheet_row: 4, tnl_sheet_row: null },
  // open, 5 h old, not on the response sheet yet
  { issue_id: 'D', zone: 'CTG', concern_hub: null, issue_category: null, submitted_at: ago(5), issue_status: 'Open', ops_issue_status: 'New', ops_status: null, validation: 'Invalid', central_sort_sheet_row: null, tnl_sheet_row: null },
];

test('counts: total, open, closed, past SLA and not on the sheet', () => {
  const a = buildRouteAnalytics(rows, { route: 'central_sort', now: NOW, catIndex: indexCategories([]) });
  assert.equal(a.total, 4);
  assert.equal(a.open, 3);
  assert.equal(a.closed, 1);
  assert.equal(a.late, 1);
  assert.equal(a.not_on_sheet, 1);
  assert.deepEqual(a.sla, { closed: 1, pending: 2, breached: 1 });
});

test('not-on-sheet counts the route column for that route only', () => {
  const a = buildRouteAnalytics(rows, { route: 'tnl', now: NOW, catIndex: indexCategories([]) });
  assert.equal(a.not_on_sheet, 4); // every row has tnl_sheet_row null
  assert.equal(a.label, 'TNL');
});

test('a category SLA is used for the target', () => {
  const cats = indexCategories([{ category: 'Damaged', sub_category: '', side: 'requester', is_active: true, sla_isd: 1, sla_osd: 1, sla_ctg: 1 }]);
  const a = buildRouteAnalytics(rows, { route: 'central_sort', now: NOW, catIndex: cats });
  // B (Damaged, OSD, 100 h old) is past 1 day. C is resolved. A is Late delivery (default 72 h, 24 h old): pending.
  assert.equal(a.late, 1);
  assert.equal(a.sla.breached, 1);
});

test('ops status and validation are counted; empty values show as Not set', () => {
  const a = buildRouteAnalytics(rows, { route: 'central_sort', now: NOW, catIndex: indexCategories([]) });
  const ops = Object.fromEntries(a.ops_status.map((s) => [s.label, s.value]));
  assert.equal(ops['Picked'], 1);
  assert.equal(ops['In Progress'], 1);
  assert.equal(ops['Resolved'], 1);
  assert.equal(ops['Not set'], 1);
  assert.equal(a.ops_status.reduce((s, x) => s + x.value, 0), 4);
  const val = Object.fromEntries(a.validation.map((s) => [s.label, s.value]));
  assert.equal(val['Valid'], 2);
  assert.equal(val['Invalid'], 1);
  assert.equal(val['Not set'], 1);
});

test('zones, hubs and categories carry totals, open and late counts', () => {
  const a = buildRouteAnalytics(rows, { route: 'central_sort', now: NOW, catIndex: indexCategories([]) });
  const isd = a.zones.find((z) => z.label === 'ISD');
  assert.deepEqual([isd.total, isd.open, isd.late], [2, 1, 0]);
  const osd = a.zones.find((z) => z.label === 'OSD');
  assert.deepEqual([osd.total, osd.open, osd.late], [1, 1, 1]);
  const damaged = a.categories.find((c) => c.label === 'Damaged');
  assert.deepEqual([damaged.total, damaged.open, damaged.late], [2, 1, 1]);
  assert.ok(a.categories.some((c) => c.label === 'Not set'));
});

test('trend has one point per day and counts every row inside the window', () => {
  const a = buildRouteAnalytics(rows, { route: 'central_sort', now: NOW, catIndex: indexCategories([]) });
  assert.equal(a.trend.labels.length, a.trend.values.length);
  assert.equal(a.trend.values.reduce((s, v) => s + v, 0), 4);
});

test('empty input gives zero counts and no crash', () => {
  const a = buildRouteAnalytics([], { route: 'tnl', now: NOW });
  assert.deepEqual([a.total, a.open, a.closed, a.late, a.not_on_sheet], [0, 0, 0, 0, 0]);
});
