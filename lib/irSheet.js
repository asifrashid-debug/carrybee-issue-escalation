// Writes one escalation to the IR sheet (tab "Active", columns A-R). Idempotent: finds the row by Issue ID in column A.
// Same pattern as pushToSheet for the hub sheets. Needs IR_SHEET_ID.
import { getSheetsClient } from './sheets.js';
import { findIssueRow, lastFilledRow, cellText } from './sheetRows.js';
import { irRowFromEsc, irSlaCells, IR_HEADERS } from './irEscalation.mjs';

const TAB = 'Active';
const LAST_COL = 'R'; // 18 columns

export function irSheetId() { return process.env.IR_SHEET_ID || null; }

export async function pushIrRow(esc) {
  const sid = irSheetId();
  if (!sid) throw new Error('IR_SHEET_ID is not set');
  const sheets = await getSheetsClient();
  const read = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: `${TAB}!A:A` });
  const rows = read.data.values || [];
  const found = findIssueRow(rows, esc.issue_id);
  const row = irRowFromEsc(esc, irSlaCells(esc));
  const target = found || lastFilledRow(rows) + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${TAB}!A${target}:${LAST_COL}${target}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
  if (!found) {
    const check = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: `${TAB}!A${target}` });
    if (cellText([check.data.values?.[0]?.[0]]) !== esc.issue_id) throw new Error(`IR row ${target} write not confirmed for ${esc.issue_id}`);
  }
  return { row: target, action: found ? 'updated' : 'appended' };
}

// Header check used by setup. Returns the headers that are missing from row 1 of the IR sheet.
export async function missingIrHeaders() {
  const sid = irSheetId();
  if (!sid) throw new Error('IR_SHEET_ID is not set');
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: `${TAB}!1:1` });
  const have = (res.data.values?.[0] || []).map((h) => String(h).trim());
  return IR_HEADERS.filter((h) => !have.includes(h));
}
