import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listView, listCounts, raisedRefs, isOverdue, matchesFilter, LIST_PAGE_MAX } from '../lib/opsListView.mjs';
import { dueState } from '../lib/opsLifecycle.mjs';

const NOW = new Date('2026-11-27T12:00:00Z');
const ago = (min) => new Date(NOW.getTime() - min * 60000).toISOString();

// Raised 40 min ago: pick window (30 min) has passed, so it is overdue.
const late = { issue_id: 'ISS-000002', source: 'hub', issue_status: 'Raised', raised_at: ago(40), pick_due_at: ago(10), resolve_due_at: new Date(NOW.getTime() + 3600e3).toISOString(), merchant_name: 'Shop Late', consignment_id: 'CB-2' };
// Raised 5 min ago: inside the pick window.
const fresh = { issue_id: 'ISS-000001', source: 'ir', issue_status: 'Raised', raised_at: ago(5), pick_due_at: ago(-25), resolve_due_at: ago(-1435), merchant_name: 'Shop Fresh', consignment_id: 'CB-1' };
// Picked, resolve window passed: overdue through the resolve rule.
const picked = { issue_id: 'ISS-000003', source: 'tnl', issue_status: 'In Progress', picked_at: ago(20), raised_at: ago(3000), pick_due_at: ago(2970), resolve_due_at: ago(1500), merchant_name: 'Shop Picked', consignment_id: 'CB-3' };
// Resolved: never overdue.
const done = { issue_id: 'ISS-000004', source: 'hub', issue_status: 'Resolved', raised_at: ago(3000), pick_due_at: ago(2970), resolve_due_at: ago(1500), closed_at: ago(1600), merchant_name: 'Shop Done', consignment_id: 'CB-4' };
const ALL = [late, fresh, picked, done];

test('overdue matches dueState (the same rule as the page count)', () => {
  for (const i of ALL) assert.equal(isOverdue(i, NOW), dueState(i, NOW).overdue, i.issue_id);
  assert.equal(isOverdue(late, NOW), true);
  assert.equal(isOverdue(fresh, NOW), false);
  assert.equal(isOverdue(picked, NOW), true);
  assert.equal(isOverdue(done, NOW), false);
});

test('filters: pick, open, closed, overdue, all', () => {
  assert.equal(matchesFilter(fresh, 'pick', NOW), true);
  assert.equal(matchesFilter(picked, 'pick', NOW), false);
  assert.equal(matchesFilter(picked, 'open', NOW), true);
  assert.equal(matchesFilter(done, 'closed', NOW), true);
  assert.equal(matchesFilter(late, 'overdue', NOW), true);
  assert.equal(matchesFilter(done, 'all', NOW), true);
});

test('counts per source tab', () => {
  const c = listCounts(ALL, NOW);
  assert.deepEqual(c.all, { named: 4, toPick: 2, overdue: 2 });
  assert.deepEqual(c.hub, { named: 2, toPick: 1, overdue: 1 });
  assert.deepEqual(c.ir, { named: 1, toPick: 1, overdue: 0 });
  assert.deepEqual(c.tnl, { named: 1, toPick: 0, overdue: 1 });
  assert.deepEqual(c.sort, { named: 0, toPick: 0, overdue: 0 });
});

test('the page slice is correct and total ignores paging', () => {
  const r = listView(ALL, { size: 2 }, NOW);
  assert.equal(r.total, 4);
  assert.equal(r.issues.length, 2);
  assert.deepEqual(r.issues.map((i) => i.issue_id), ['ISS-000001', 'ISS-000002'], 'newest first by default');
  const oldest = listView(ALL, { size: 10, sort: 'oldest' }, NOW);
  assert.equal(oldest.issues[0].issue_id, 'ISS-000003');
});

test('source tab and filter combine', () => {
  const r = listView(ALL, { source: 'hub', filter: 'overdue', size: 100 }, NOW);
  assert.deepEqual(r.issues.map((i) => i.issue_id), ['ISS-000002']);
  assert.equal(r.total, 1);
});

test('search matches issue ID, consignment and merchant, case-insensitive', () => {
  assert.equal(listView(ALL, { q: 'shop fresh' }, NOW).total, 1);
  assert.equal(listView(ALL, { q: 'cb-3' }, NOW).issues[0].issue_id, 'ISS-000003');
  assert.equal(listView(ALL, { q: '   ' }, NOW).total, 4, 'blank search is no filter');
  assert.equal(listView(ALL, { q: 'nomatch' }, NOW).total, 0);
});

test('size is clamped: no more than the maximum per request', () => {
  const many = Array.from({ length: 700 }, (_, k) => ({ ...fresh, issue_id: `X-${String(k).padStart(4, '0')}` }));
  assert.equal(listView(many, { size: 100000 }, NOW).issues.length, LIST_PAGE_MAX);
  assert.equal(listView(many, { size: 'abc' }, NOW).issues.length, 100);
});

test('unknown source or filter falls back to all', () => {
  assert.equal(listView(ALL, { source: 'nope', filter: 'nope' }, NOW).total, 4);
});

test('raised references carry only what the badge needs', () => {
  const refs = raisedRefs(ALL);
  assert.deepEqual(refs.map((r) => r.issue_id).sort(), ['ISS-000001', 'ISS-000002']);
  assert.deepEqual(Object.keys(refs[0]).sort(), ['issue_id', 'issue_status', 'source']);
})
