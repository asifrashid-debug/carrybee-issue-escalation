import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, HEADERS, escToRow } from '../lib/sheets.js';

test('sheet layout ends with Completed At in column AE', () => {
  assert.equal(COLS.length, 31);
  assert.equal(HEADERS.length, 31);
  assert.equal(COLS[30], 'completed_at');
  assert.equal(HEADERS[30], 'Completed At');
});

test('escToRow writes 31 values with completed_at last', () => {
  const row = escToRow({ issue_id: 'CB-14-11-TEST', submitted_at: '2026-11-14T06:00:00Z', zone: 'ISD', channel: 'KAM', issue_details: 'x'.repeat(20), ops_status: 'Completed', completed_at: '2026-11-15T06:00:00Z', layer1_response: '' });
  assert.equal(row.length, 31);
  assert.notEqual(row[30], '');
  assert.equal(escToRow({ issue_id: 'a', zone: 'ISD', channel: 'KAM', ops_status: 'Pending' })[30], '');
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
  assert.deepEqual(cols.sort(), ['AC', 'AD', 'V', 'Z'].sort());
  assert.equal(plan.find(c => c.col === 'Z').value, 'Completed');
  assert.equal(plan.find(c => c.col === 'V').value, 'ok');
  assert.equal(plan.find(c => c.col === 'AC').value, '4');
  assert.ok(!cols.includes('A'), 'Issue ID column must never be written');
  assert.ok(!cols.includes('Q'), 'hub Layer 1 must not be written by a tracker edit');
});

test('cellPlan with no changed fields still bumps row_version', () => {
  const plan = cellPlan({ issue_id: 'a', zone: 'ISD', channel: 'KAM', row_version: 2 }, []);
  assert.deepEqual(plan.map(c => c.field).sort(), ['last_synced_at', 'row_version']);
});
