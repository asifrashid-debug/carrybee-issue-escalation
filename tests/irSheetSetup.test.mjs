import test from 'node:test';
import assert from 'node:assert/strict';
import { irSheetSetupRequests, irHeaderRange, IR_STATUS_COL_INDEX, IR_VALIDATION_LAST_ROW } from '../lib/irSheetSetup.mjs';
import { IR_HEADERS, IR_STATUSES } from '../lib/irEscalation.mjs';

test('header range covers the 18 IR columns on the Active tab', () => {
  assert.equal(IR_HEADERS.length, 18);
  assert.equal(irHeaderRange(), 'Active!A1:R1');
});

test('status dropdown is on column P, rows 2 to 1000, strict, with the four IR statuses', () => {
  const dv = irSheetSetupRequests(7).find((r) => r.setDataValidation).setDataValidation;
  assert.equal(dv.range.sheetId, 7);
  assert.equal(dv.range.startRowIndex, 1);
  assert.equal(dv.range.endRowIndex, IR_VALIDATION_LAST_ROW);
  assert.equal(dv.range.startColumnIndex, IR_STATUS_COL_INDEX);
  assert.equal(dv.range.endColumnIndex, IR_STATUS_COL_INDEX + 1);
  assert.equal(String.fromCharCode(65 + IR_STATUS_COL_INDEX), 'P');
  assert.equal(dv.rule.condition.type, 'ONE_OF_LIST');
  assert.equal(dv.rule.strict, true);
  assert.deepEqual(dv.rule.condition.values.map((v) => v.userEnteredValue), IR_STATUSES);
});

test('header row is frozen', () => {
  const up = irSheetSetupRequests(0).find((r) => r.updateSheetProperties).updateSheetProperties;
  assert.equal(up.properties.gridProperties.frozenRowCount, 1);
});
