/**
 * Ops Issues: automatic timestamps (add this as a NEW file in each
 * hub spreadsheet's Apps Script project; do not replace Code.gs).
 *
 * Tab: 'Ops Issues' (ISD, OSD, CTG). Name restored after a brief rename.
 * Helper columns are Q (Pick Done At) and R (Resolved At). O and P are the
 * live "Issue Pick SLA" and "Issue Resolution SLA" formula columns, so this
 * script never writes to them.
 *
 * Columns on 'Ops Issues':
 *   B  Issue Raise Time      stamped once, when Consignment ID (C) or Merchant Name (D) first gets input
 *   J  Issue Status          pick clock stops when this leaves "Raised"; resolution stops at "Resolved"
 *   Q  Pick Done At (helper) stamped once, first time J is non-empty and not "Raised"
 *   R  Resolved At (helper)  stamped once, first time J = "Resolved"
 *
 * Timestamps are written as values, once. Existing values are never overwritten.
 * Setup: run setupOpsIssuesStamp() once per spreadsheet.
 */

const OPS_ISSUES_SHEET = 'Ops Issues';
const OPS_COL = { RAISE: 2, CONSIGNMENT: 3, MERCHANT: 4, STATUS: 10, PICK_DONE: 17, RESOLVED: 18 };
const OPS_LAST_COL = 18;

// Pure logic: given one row's current values, return the cells to stamp (column -> Date).
// rowVals is an array indexed by column number (1-based), i.e. rowVals[2] is column B.
function opsStampsForRow_(rowVals, now) {
  const out = {};
  const filled = v => v !== undefined && v !== null && String(v).trim() !== '';
  const raiseEmpty = !filled(rowVals[OPS_COL.RAISE]);
  if (raiseEmpty && (filled(rowVals[OPS_COL.CONSIGNMENT]) || filled(rowVals[OPS_COL.MERCHANT]))) {
    out[OPS_COL.RAISE] = now;
  }
  const raiseNow = raiseEmpty ? out[OPS_COL.RAISE] : rowVals[OPS_COL.RAISE];
  const status = filled(rowVals[OPS_COL.STATUS]) ? String(rowVals[OPS_COL.STATUS]).trim() : '';
  if (raiseNow && status !== '' && status !== 'Raised') {
    if (!filled(rowVals[OPS_COL.PICK_DONE])) out[OPS_COL.PICK_DONE] = now;
    if (status === 'Resolved' && !filled(rowVals[OPS_COL.RESOLVED])) out[OPS_COL.RESOLVED] = now;
  }
  return out;
}

// Installable onEdit handler (created by setupOpsIssuesStamp).
function opsIssuesOnEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== OPS_ISSUES_SHEET) return;
  const r0 = e.range.getRow();
  const r1 = e.range.getLastRow();
  if (r0 < 2) return; // header row
  const cLo = e.range.getColumn();
  const cHi = e.range.getLastColumn();
  // Only react when the edit touches a relevant column.
  const relevant = [OPS_COL.CONSIGNMENT, OPS_COL.MERCHANT, OPS_COL.STATUS];
  const touches = relevant.some(c => c >= cLo && c <= cHi);
  if (!touches) return;

  const now = new Date();
  const n = r1 - r0 + 1;
  const data = sheet.getRange(r0, 1, n, OPS_LAST_COL).getValues();
  for (let i = 0; i < n; i++) {
    const rowVals = {};
    for (let c = 1; c <= OPS_LAST_COL; c++) rowVals[c] = data[i][c - 1];
    const stamps = opsStampsForRow_(rowVals, now);
    Object.keys(stamps).forEach(c => {
      const cell = sheet.getRange(r0 + i, Number(c));
      cell.setValue(stamps[c]);
      cell.setNumberFormat('dd-MMM-yyyy hh:mm a');
    });
  }
}

// Run once per spreadsheet. Creates the trigger only if it does not already exist.
function setupOpsIssuesStamp() {
  const ss = SpreadsheetApp.getActive();
  const exists = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'opsIssuesOnEdit');
  if (!exists) {
    ScriptApp.newTrigger('opsIssuesOnEdit').forSpreadsheet(ss).onEdit().create();
  }
  Logger.log('Ops Issues stamp trigger ready: ' + !exists + ' (created now)');
}
