// Escalated issues stay in the main tracker. A failed sheet write can be retried from the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOnTeamSheet } from '../lib/escalateTo.mjs';

test('not escalated: nothing to write, counts as on the sheet', () => {
  assert.equal(isOnTeamSheet({ escalated_to: null }), true);
});

test('IR escalation with no IR row: not on the sheet', () => {
  assert.equal(isOnTeamSheet({ escalated_to: 'ir', ir_sheet_row: null }), false);
});

test('Central Sort escalation with a row: on the sheet', () => {
  assert.equal(isOnTeamSheet({ escalated_to: 'central_sort', central_sort_sheet_row: 4 }), true);
});

test('TNL escalation with no TNL row: not on the sheet', () => {
  assert.equal(isOnTeamSheet({ escalated_to: 'tnl', tnl_sheet_row: null, central_sort_sheet_row: 3 }), false);
});

test('retry endpoint: checks visibility, refuses when already on the sheet, uses the same writers', () => {
  const src = readFileSync(new URL('../app/api/escalations/[id]/retry-sheet/route.js', import.meta.url), 'utf8');
  assert.match(src, /isVisible\(await loadScope/);
  assert.match(src, /status: 409/);
  assert.match(src, /queueIrSync\(sb, cur\)/);
  assert.match(src, /queueRouteSync\(sb, cur, team\.key\)/);
});

test('card shows the retry button only for escalated issues not on their sheet', () => {
  const src = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
  assert.match(src, /e\.escalated_to && !isOnTeamSheet\(e\) && \(/);
  assert.match(src, /<RetrySheetButton issueId=\{e\.issue_id\}/);
});
