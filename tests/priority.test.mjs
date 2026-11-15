import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { priorityForIssueType, PRIORITY_BY_ISSUE_TYPE } from '../lib/priority.js';

const cats = JSON.parse(fs.readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8'));

test('issue type maps to priority: Critical P1, Urgent P2, Regular P3', () => {
  assert.equal(priorityForIssueType('Critical'), 'P1');
  assert.equal(priorityForIssueType('Urgent'), 'P2');
  assert.equal(priorityForIssueType('Regular'), 'P3');
  assert.equal(priorityForIssueType('Unknown'), null);
  assert.equal(priorityForIssueType(null), null);
});

test('every requester sub category in the list gets a priority', () => {
  assert.equal(cats.length, 105);
  for (const c of cats) assert.ok(priorityForIssueType(c.issue_type), `${c.category} / ${c.sub_category}`);
  assert.deepEqual(Object.keys(PRIORITY_BY_ISSUE_TYPE).sort(), ['Critical', 'Regular', 'Urgent']);
});
