import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, HEADERS, escToRow } from '../lib/sheets.js';

// Layout since Final Response (21 Nov): 35 columns, A-AI. Final Response is T (index 19).
test('Completed At stays in column AF; AG-AI are the derived validation columns', () => {
  assert.equal(COLS.length, 35);
  assert.equal(HEADERS.length, 35);
  assert.equal(COLS[31], 'completed_at');
  assert.equal(HEADERS[31], 'Completed At');
  assert.deepEqual(COLS.slice(32), ['issue_pick_check', 'issue_resolution_check', 'overall_validation']);
});

test('escToRow writes 35 values with Completed At in AF', () => {
  const row = escToRow({ issue_id: 'CB-14-11-TEST', submitted_at: '2026-11-14T06:00:00Z', zone: 'ISD', channel: 'KAM', issue_details: 'x'.repeat(20), ops_status: 'Completed', completed_at: '2026-11-15T06:00:00Z', layer1_response: '' });
  assert.equal(row.length, 35);
  assert.notEqual(row[31], '');
  assert.equal(escToRow({ issue_id: 'a', zone: 'ISD', channel: 'KAM', ops_status: 'Pending' })[31], '');
});

import { colLetter, cellPlan } from '../lib/sheets.js';

test('colLetter maps indexes to A1 letters', () => {
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(25), 'Z');
  assert.equal(colLetter(26), 'AA');
  assert.equal(colLetter(28), 'AC');
  assert.equal(colLetter(30), 'AE');
});

test('cellPlan writes only the changed columns plus row_version and last_synced_at', () => {
  const esc = { issue_id: 'CB-14-11-TEST', submitted_at: '2026-11-14T06:00:00Z', zone: 'ISD', channel: 'KAM', issue_details: 'x'.repeat(20), ops_status: 'Completed', remarks: 'ok', row_version: 4, layer1_response: 'hub text' };
  const plan = cellPlan(esc, ['ops_status', 'remarks']);
  const cols = plan.map(c => c.col);
  // Derived AG-AI are always refreshed with the edit (the AG-AI rules), so they are part of every plan.
  // AA = ops_status, W = remarks, AD = row_version, AE = last_synced_at.
  assert.deepEqual(cols.sort(), ['AA', 'AD', 'AE', 'AG', 'AH', 'AI', 'W'].sort());
  assert.equal(plan.find(c => c.col === 'AA').value, 'Completed');
  assert.equal(plan.find(c => c.col === 'W').value, 'ok');
  assert.equal(plan.find(c => c.col === 'AD').value, '4');
  assert.ok(!cols.includes('A'), 'Issue ID column must never be written');
  assert.ok(!cols.includes('Q'), 'hub Layer 1 must not be written by a tracker edit');
});

test('cellPlan with no changed fields still bumps row_version and refreshes AG-AI', () => {
  const plan = cellPlan({ issue_id: 'a', zone: 'ISD', channel: 'KAM', row_version: 2 }, []);
  assert.deepEqual(plan.map(c => c.field).sort(), ['issue_pick_check', 'issue_resolution_check', 'last_synced_at', 'overall_validation', 'row_version']);
});
