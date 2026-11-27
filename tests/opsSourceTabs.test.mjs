import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPS_SOURCE_TABS, opsSourceTabForKey, opsSourceTabForSheetId, withOpsSource, inOpsSourceTab } from '../lib/opsIssues.mjs';
import { nextSeenIds, unseenCount } from '../lib/opsBadge.mjs';

const SID = { ISD: 'isd-1', OSD: 'osd-1', CTG: 'ctg-1', IR: 'ir-1', TNL: 'tnl-1', CENTRAL_SORT: 'sort-1' };

test('tabs are all, hub, ir, sort, tnl in that order', () => {
  assert.deepEqual(OPS_SOURCE_TABS.map((t) => t.key), ['all', 'hub', 'ir', 'sort', 'tnl']);
});

test('each sync source key maps to its tab; the three hub zones share hub', () => {
  assert.equal(opsSourceTabForKey('ISD'), 'hub');
  assert.equal(opsSourceTabForKey('OSD'), 'hub');
  assert.equal(opsSourceTabForKey('CTG'), 'hub');
  assert.equal(opsSourceTabForKey('IR'), 'ir');
  assert.equal(opsSourceTabForKey('CENTRAL_SORT'), 'sort');
  assert.equal(opsSourceTabForKey('TNL'), 'tnl');
  assert.equal(opsSourceTabForKey('XX'), null);
});

test('an issue takes its tab from its spreadsheet ID; unknown or missing IDs give null', () => {
  assert.equal(opsSourceTabForSheetId(SID, 'osd-1'), 'hub');
  assert.equal(opsSourceTabForSheetId(SID, 'sort-1'), 'sort');
  assert.equal(opsSourceTabForSheetId(SID, 'tnl-1'), 'tnl');
  assert.equal(opsSourceTabForSheetId(SID, 'other'), null);
  assert.equal(opsSourceTabForSheetId(SID, null), null);
});

test('withOpsSource adds source and drops the sheet ID from the output', () => {
  const out = withOpsSource([{ issue_id: 'CB-1', sheet_spreadsheet_id: 'ir-1' }, { issue_id: 'CB-2', sheet_spreadsheet_id: 'x' }], SID);
  assert.deepEqual(out, [{ issue_id: 'CB-1', source: 'ir' }, { issue_id: 'CB-2', source: null }]);
});

test('the all tab takes every issue; a source tab takes only its own', () => {
  const i = { source: 'hub' };
  assert.equal(inOpsSourceTab(i, 'all'), true);
  assert.equal(inOpsSourceTab(i, 'hub'), true);
  assert.equal(inOpsSourceTab(i, 'ir'), false);
  assert.equal(inOpsSourceTab({ source: null }, 'all'), true);
  assert.equal(inOpsSourceTab({ source: null }, 'hub'), false);
});

test('nextSeenIds keeps other tabs seen and adds only the shown Raised issues', () => {
  const all = [
    { issue_id: 'H1', issue_status: 'Raised', source: 'hub' },
    { issue_id: 'I1', issue_status: 'Raised', source: 'ir' },
    { issue_id: 'I2', issue_status: 'Raised', source: 'ir' },
  ];
  // IR was seen earlier; now the HUB tab is opened.
  const seen = nextSeenIds(all, ['I1'], all.filter((i) => i.source === 'hub'));
  assert.deepEqual(seen, ['H1', 'I1']);
  assert.equal(unseenCount(all, seen), 1); // only I2 is still new across all tabs
});

test('nextSeenIds drops ids that are no longer Raised, so they count again if raised later', () => {
  const all = [{ issue_id: 'H1', issue_status: 'Picked', source: 'hub' }];
  assert.deepEqual(nextSeenIds(all, ['H1', 'GONE'], []), []);
});

test('nextSeenIds with an empty previous list works', () => {
  assert.deepEqual(nextSeenIds([{ issue_id: 'A', issue_status: 'Raised' }], null, [{ issue_id: 'A', issue_status: 'Raised' }]), ['A']);
});
