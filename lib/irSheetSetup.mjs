// Pure helpers for creating the IR sheet (no network). Tested in tests/irSheetSetup.test.mjs.
import { IR_HEADERS, IR_STATUSES } from './irEscalation.mjs';

export const IR_SHEET_TITLE = 'CarryBee IR Issue Escalation';
export const IR_TAB = 'Active';
export const IR_STATUS_COL_INDEX = 15; // column P (A = 0)
export const IR_VALIDATION_LAST_ROW = 1000; // rows 2..1000, same as the existing sheet

// The Sheets batchUpdate body that sets the Status From KAM / IR Status dropdown (column P)
// and freezes row 1. Sheet ID is the numeric ID of the IR tab (0 for a new spreadsheet's first tab).
export function irSheetSetupRequests(sheetId = 0) {
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: IR_VALIDATION_LAST_ROW,
          startColumnIndex: IR_STATUS_COL_INDEX,
          endColumnIndex: IR_STATUS_COL_INDEX + 1,
        },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: IR_STATUSES.map((v) => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: true,
        },
      },
    },
  ];
}

export function irHeaderRange() {
  return `${IR_TAB}!A1:${String.fromCharCode(64 + IR_HEADERS.length)}1`;
}
