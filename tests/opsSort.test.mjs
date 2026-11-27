import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortOpsIssues, OPS_SORT_OPTIONS } from '../lib/opsIssues.mjs';

const rows = [
  { issue_id: 'CB-2', raised_at: '2026-11-27T10:00:00+00:00' },
  { issue_id: 'CB-1', raised_at: '2026-11-27T12:00:00+00:00' },
  { issue_id: 'CB-3', raised_at: null },
  { issue_id: 'CB-4', raised_at: '2026-11-26T09:00:00+00:00' },
];

test('newest first is the default and puts the latest raised issue on top', () => {
  assert.deepEqual(sortOpsIssues(rows).map((i) => i.issue_id), ['CB-1', 'CB-2', 'CB-4', 'CB-3']);
  assert.deepEqual(sortOpsIssues(rows, 'newest').map((i) => i.issue_id), ['CB-1', 'CB-2', 'CB-4', 'CB-3']);
});

test('oldest first reverses the dated issues and still puts undated last', () => {
  assert.deepEqual(sortOpsIssues(rows, 'oldest').map((i) => i.issue_id), ['CB-4', 'CB-2', 'CB-1', 'CB-3']);
});

test('does not change the input array', () => {
  const copy = rows.map((r) => ({ ...r }));
  sortOpsIssues(copy);
  assert.deepEqual(copy.map((i) => i.issue_id), ['CB-2', 'CB-1', 'CB-3', 'CB-4']);
});

test('same raise time breaks ties by Issue ID', () => {
  const same = [{ issue_id: 'CB-1', raised_at: '2026-11-27T10:00:00Z' }, { issue_id: 'CB-2', raised_at: '2026-11-27T10:00:00Z' }];
  assert.deepEqual(sortOpsIssues(same).map((i) => i.issue_id), ['CB-2', 'CB-1']);
});

test('the sort options are newest then oldest', () => {
  assert.deepEqual(OPS_SORT_OPTIONS.map((o) => o.key), ['newest', 'oldest']);
});
