// The hub tab names in the app must match the hub sheets and the hub Apps Script files.
// Hub response tab: 'Active'. Ops tab: 'Ops Issues'. Both are the names on the live ISD, OSD and CTG sheets (restored after a brief rename).
// If one side changes without the other, the tracker write-back and the Apps Script stop working. This test catches that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPS_SHEET } from '../lib/opsIssues.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Ops sync tab is Ops Issues', () => {
  assert.equal(OPS_SHEET, 'Ops Issues');
});

test('hub writer (lib/sheets.js) writes to the Active response tab', () => {
  const src = read('../lib/sheets.js');
  assert.match(src, /Active!A/);
  assert.doesNotMatch(src, /KAM to Ops Issues|Ops to KAM issues/);
});

test('hub edit script (Code.gs) watches the Active response tab', () => {
  const src = read('../apps-script/Code.gs');
  assert.match(src, /const SHEET_NAME = 'Active';/);
});

test('timestamp script (hub-Ops-Issue-Stamp.gs) watches the Ops Issues tab', () => {
  const src = read('../apps-script/hub-Ops-Issue-Stamp.gs');
  assert.match(src, /const OPS_ISSUES_SHEET = 'Ops Issues';/);
});

test('IR response tab stays Active', () => {
  const src = read('../apps-script/IR-Code.gs');
  assert.match(src, /const IR_SHEET_NAME = 'Active';/);
});
