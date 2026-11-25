// Pure helpers for creating the IR sheet (no network). Tested in tests/irSheetSetup.test.mjs.
import { IR_HEADERS, IR_STATUSES, IR_MEMBERS } from './irEscalation.mjs';

export const IR_SHEET_TITLE = 'CarryBee IR Issue Escalation';
export const IR_TAB = 'Active';
export const IR_STATUS_COL_INDEX = 15; // column P (A = 0)
export const IR_VALIDATION_LAST_ROW = 1000; // rows 2..1000, same as the existing sheet
export const IR_MEMBER_COL_INDEX = 12; // column M: Assigned IR Member (A = 0)

// Dropdown for one column (strict list), rows 2..1000.
export function listValidationRequest(sheetId, colIndex, values) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, endRowIndex: IR_VALIDATION_LAST_ROW, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: true,
      },
    },
  };
}

// The Sheets batchUpdate body that freezes row 1 and sets the dropdowns: IR Status (column P)
// and Assigned IR Member (column M). Sheet ID is the numeric ID of the IR tab (0 for a new spreadsheet's first tab).
export function irSheetSetupRequests(sheetId = 0) {
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    listValidationRequest(sheetId, IR_STATUS_COL_INDEX, IR_STATUSES),
    listValidationRequest(sheetId, IR_MEMBER_COL_INDEX, IR_MEMBERS),
  ];
}

export function irHeaderRange() {
  return `${IR_TAB}!A1:${String.fromCharCode(64 + IR_HEADERS.length)}1`;
}
