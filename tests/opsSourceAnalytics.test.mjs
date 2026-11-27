import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpsSourceAnalytics } from '../lib/opsSourceAnalytics.mjs';

const NOW = new Date('2026-11-27T12:00:00Z');
const rows = [
  { issue_id: 'A', issue_status: 'Raised', validation: null, zone: 'ISD', hub_name: 'H1', issue_category: 'Late', raised_at: '2026-11-27T04:00:00Z', pick_due_at: '2026-11-27T04:30:00Z', resolve_due_at: '2026-11-28T04:00:00Z', kam_feedback: null },
  { issue_id: 'B', issue_status: 'Resolved', validation: 'Valid', zone: 'ISD', hub_name: 'H1', issue_category: 'Late', raised_at: '2026-11-26T04:00:00Z', picked_at: '2026-11-26T04:10:00Z', closed_at: '2026-11-26T10:00:00Z', resolve_due_at: '2026-11-27T04:00:00Z', kam_feedback: 'ok' },
  { issue_id: 'C', issue_status: 'Picked', validation: 'Invalid', zone: 'OSD', hub_name: 'H2', issue_category: 'Damage', raised_at: '2026-11-20T04:00:00Z', picked_at: '2026-11-20T04:10:00Z', pick_due_at: '2026-11-20T04:30:00Z', resolve_due_at: '2026-11-21T04:00:00Z', kam_feedback: '' },
];

test('counts open, closed and past target with the lifecycle rule', () => {
  const a = buildOpsSourceAnalytics(rows, { source: 'hub', now: NOW });
  assert.equal(a.total, 3);
  assert.equal(a.open, 2);
  assert.equal(a.closed, 1);
  // A: raised 04:00 UTC, pick window 30 min, not picked, so past target. C: resolve window (21 Nov) passed.
  assert.equal(a.late, 2);
  assert.deepEqual(a.sla, { closed: 1, pending: 0, breached: 2 });
});

test('feedback counts only non-blank KAM feedback', () => {
  assert.equal(buildOpsSourceAnalytics(rows, { source: 'hub', now: NOW }).feedback_added, 1);
});

test('status and validation lists keep every label, with Not set', () => {
  const a = buildOpsSourceAnalytics(rows, { source: 'hub', now: NOW });
  assert.equal(a.status.find((s) => s.label === 'Raised').value, 1);
  assert.equal(a.status.find((s) => s.label === 'Not Resolved').value, 0);
  assert.equal(a.validation.find((s) => s.label === 'Not set').value, 1);
  assert.equal(a.validation.find((s) => s.label === 'Invalid').value, 1);
});

test('groups by zone, hub and category, sorted by count', () => {
  const a = buildOpsSourceAnalytics(rows, { source: 'hub', now: NOW });
  assert.deepEqual(a.zones.map((z) => [z.label, z.total]), [['ISD', 2], ['OSD', 1]]);
  assert.equal(a.hubs[0].label, 'H1');
  assert.equal(a.categories[0].label, 'Late');
});

test('trend covers 14 Dhaka days ending today for All time, and counts raised per day', () => {
  const a = buildOpsSourceAnalytics(rows, { source: 'hub', now: NOW });
  assert.equal(a.trend.labels.length, 14);
  assert.equal(a.trend.labels[13], '11-27'); // MM-DD, reversed for display by the component
  assert.equal(a.trend.values[13], 1); // A raised 27 Nov (Dhaka)
  assert.equal(a.trend.values[12], 1); // B raised 26 Nov (Dhaka)
  assert.equal(a.trend.values.reduce((s, v) => s + v, 0), 3); // C (20 Nov) is inside the 14 days too
});

test('an empty source gives zeros and a label', () => {
  const a = buildOpsSourceAnalytics([], { source: 'tnl', now: NOW });
  assert.equal(a.total, 0);
  assert.equal(a.label, 'TNL');
  assert.equal(a.zones.length, 0);
});
