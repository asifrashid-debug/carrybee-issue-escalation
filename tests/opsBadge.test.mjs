import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewIssue, raisedIssueIds, unseenCount, seenStorageKey, parseSeen } from '../lib/opsBadge.mjs';

const issues = [
  { issue_id: 'CB-1', issue_status: 'Raised' },
  { issue_id: 'CB-2', issue_status: '  Raised ' },
  { issue_id: 'CB-3', issue_status: 'Picked' },
  { issue_id: 'CB-4', issue_status: 'Resolved' },
  { issue_id: 'CB-5', issue_status: 'Raised' },
];

test('only Raised issues are new (status trimmed, exact word)', () => {
  assert.equal(isNewIssue({ issue_status: 'Raised' }), true);
  assert.equal(isNewIssue({ issue_status: ' Raised ' }), true);
  assert.equal(isNewIssue({ issue_status: 'Picked' }), false);
  assert.equal(isNewIssue({ issue_status: 'raised' }), false);
  assert.equal(isNewIssue({}), false);
  assert.equal(isNewIssue(null), false);
});

test('raisedIssueIds returns sorted unique ids of Raised issues only', () => {
  assert.deepEqual(raisedIssueIds(issues), ['CB-1', 'CB-2', 'CB-5']);
  assert.deepEqual(raisedIssueIds([]), []);
  assert.deepEqual(raisedIssueIds(undefined), []);
});

test('unseenCount: nothing seen means every Raised issue counts', () => {
  assert.equal(unseenCount(issues, []), 3);
  assert.equal(unseenCount(issues, undefined), 3);
});

test('unseenCount: seen Raised issues drop out of the badge', () => {
  assert.equal(unseenCount(issues, ['CB-1']), 2);
  assert.equal(unseenCount(issues, ['CB-1', 'CB-2', 'CB-5']), 0);
});

test('unseenCount: a new Raised issue after the last visit counts again', () => {
  const later = [...issues, { issue_id: 'CB-9', issue_status: 'Raised' }];
  assert.equal(unseenCount(later, ['CB-1', 'CB-2', 'CB-5']), 1);
});

test('unseenCount: an issue that left Raised is not counted even if unseen', () => {
  const picked = issues.map((i) => (i.issue_id === 'CB-2' ? { ...i, issue_status: 'Picked' } : i));
  assert.equal(unseenCount(picked, []), 2);
});

test('seenStorageKey is per viewer and case-insensitive', () => {
  assert.equal(seenStorageKey('Asif@Carrybee.com'), 'cb-ops-seen:asif@carrybee.com');
  assert.notEqual(seenStorageKey('a@x.com'), seenStorageKey('b@x.com'));
  assert.equal(seenStorageKey(undefined), 'cb-ops-seen:');
});

test('parseSeen accepts a JSON array and ignores anything else', () => {
  assert.deepEqual(parseSeen('["CB-1",2]'), ['CB-1', '2']);
  assert.deepEqual(parseSeen(null), []);
  assert.deepEqual(parseSeen('not json'), []);
  assert.deepEqual(parseSeen('{"a":1}'), []);
});
