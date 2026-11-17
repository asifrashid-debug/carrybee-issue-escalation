import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, tableToRecords, normalizeRecords, planReplace, blockReason, sheetIdFromInput, CM_KAM } from '../lib/businessUpload.js';

test('CSV with loader headers and quoted commas parses', () => {
  const t = parseCsv('ID,Merchant Name,KAM\n290,"Fashion, Mart",Akash Saha\n');
  const { records } = tableToRecords(t);
  assert.deepEqual(records, [{ id: '290', name: 'Fashion, Mart', kam: 'Akash Saha' }]);
});

test('sheet-style headers (business id / business name / KAM name) are accepted', () => {
  const t = [['business id', 'business name', 'KAM name', 'source'], ['141', 'Rozana', 'Ahmed Asif Rashid', 'KAM List 2025']];
  assert.deepEqual(tableToRecords(t).records, [{ id: '141', name: 'Rozana', kam: 'Ahmed Asif Rashid' }]);
});

test('missing KAM column is refused with the headers found', () => {
  assert.throws(() => tableToRecords([['ID', 'Merchant Name', 'Acq by'], ['1', 'A', 'x']]), /Missing columns.*Acq by/);
});

test('ID keeps letters, digits and hyphens; commas are removed', () => {
  const { records } = tableToRecords([['ID', 'Merchant Name', 'KAM'], ['2,761', 'Fashion Mart', 'X'], ['CBY-10001', 'zaman', 'Y']]);
  assert.equal(records[0].id, '2761');
  assert.equal(records[1].id, 'CBY-10001');
});

test('first row wins for a duplicate ID; blank KAM becomes CM', () => {
  const { rows, stats } = normalizeRecords([
    { id: '1', name: 'A', kam: 'First' },
    { id: '1', name: 'A', kam: 'Second' },
    { id: '2', name: 'B', kam: '' },
    { id: '', name: 'no id', kam: 'X' },
  ]);
  assert.deepEqual(rows, [
    { business_id: '1', business_name: 'A', kam_name: 'First' },
    { business_id: '2', business_name: 'B', kam_name: CM_KAM },
  ]);
  assert.equal(stats.duplicateIds, 1);
  assert.equal(stats.noKam, 1);
  assert.equal(stats.skippedNoIdOrName, 1);
});

test('new merchants are added and logged', () => {
  const plan = planReplace([], [{ business_id: '1', business_name: 'A', kam_name: 'K' }]);
  assert.equal(plan.counts.added, 1);
  assert.equal(plan.upserts[0].is_active, true);
  assert.equal(plan.changes[0].field_name, 'added');
});

test('a KAM change is logged with old and new values', () => {
  const plan = planReplace(
    [{ business_id: '1', business_name: 'A', kam_name: 'Old', is_active: true }],
    [{ business_id: '1', business_name: 'A', kam_name: 'New' }],
  );
  assert.equal(plan.counts.kamChanged, 1);
  assert.deepEqual(plan.changes, [{ business_id: '1', field_name: 'kam_name', old_value: 'Old', new_value: 'New' }]);
});

test('no change means no upsert and no log row', () => {
  const plan = planReplace(
    [{ business_id: '1', business_name: 'A', kam_name: 'K', is_active: true }],
    [{ business_id: '1', business_name: 'A', kam_name: 'K' }],
  );
  assert.equal(plan.upserts.length, 0);
  assert.equal(plan.changes.length, 0);
});

test('merchants missing from the upload are deactivated and set to CM', () => {
  const plan = planReplace(
    [
      { business_id: '1', business_name: 'A', kam_name: 'K', is_active: true },
      { business_id: '2', business_name: 'B', kam_name: 'Someone', is_active: true },
    ],
    [{ business_id: '1', business_name: 'A', kam_name: 'K' }],
  );
  assert.equal(plan.counts.deactivated, 1);
  assert.equal(plan.counts.resetToCm, 1);
  const gone = plan.upserts.find((u) => u.business_id === '2');
  assert.deepEqual(gone, { business_id: '2', business_name: 'B', kam_name: CM_KAM, is_active: false });
});

test('a returning merchant is reactivated', () => {
  const plan = planReplace(
    [{ business_id: '1', business_name: 'A', kam_name: 'K', is_active: false }],
    [{ business_id: '1', business_name: 'A', kam_name: 'K' }],
  );
  assert.equal(plan.counts.reactivated, 1);
  assert.equal(plan.upserts[0].is_active, true);
});

test('an empty upload is blocked', () => {
  const plan = planReplace([{ business_id: '1', business_name: 'A', kam_name: 'K', is_active: true }], []);
  assert.match(blockReason(plan), /no usable merchants/);
});

test('deactivating more than half of the active list is blocked until confirmed', () => {
  const current = Array.from({ length: 10 }, (_, i) => ({ business_id: String(i), business_name: 'M' + i, kam_name: 'K', is_active: true }));
  const plan = planReplace(current, [{ business_id: '0', business_name: 'M0', kam_name: 'K' }]);
  assert.equal(plan.counts.deactivated, 9);
  assert.match(blockReason(plan), /more than half/);
  assert.equal(blockReason(plan, { confirmLarge: true }), null);
});

test('an empty table (first load) is never blocked by the share rule', () => {
  const plan = planReplace([], [{ business_id: '1', business_name: 'A', kam_name: 'K' }]);
  assert.equal(blockReason(plan), null);
});

test('sheet ID from a full URL or a bare ID', () => {
  assert.equal(sheetIdFromInput('https://docs.google.com/spreadsheets/d/1YBOhdN5r6dPFfYg19ebSEsu0I0_cusZ-HrWVAgbm6UE/edit?gid=0'), '1YBOhdN5r6dPFfYg19ebSEsu0I0_cusZ-HrWVAgbm6UE');
  assert.equal(sheetIdFromInput('1YBOhdN5r6dPFfYg19ebSEsu0I0_cusZ-HrWVAgbm6UE'), '1YBOhdN5r6dPFfYg19ebSEsu0I0_cusZ-HrWVAgbm6UE');
  assert.equal(sheetIdFromInput('not a link'), null);
});
