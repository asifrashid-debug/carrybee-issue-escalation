// Row placement for the hub Active tabs. Pure helpers, shared by OLD and new issues.
// colA: the values of Active!A:A as returned by the Sheets API (rows[i][0] may be missing or '').

export function cellText(row) {
  return row && row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
}

// 1-based row number of the last row that has an Issue ID in column A (header counts as 1).
export function lastFilledRow(colA) {
  for (let i = colA.length - 1; i >= 1; i--) {
    if (cellText(colA[i]) !== '') return i + 1;
  }
  return 1;
}

// 1-based row of an Issue ID in column A, or null.
export function findIssueRow(colA, issueId) {
  for (let i = 1; i < colA.length; i++) {
    if (cellText(colA[i]) === issueId) return i + 1;
  }
  return null;
}

// Rows for a batch of new issues: contiguous, starting directly after the last filled row.
// Issues already on the sheet are not given a new row (the caller updates them in place).
export function planAppend(colA, issueIds) {
  const existing = new Set();
  for (const id of issueIds) {
    const r = findIssueRow(colA, id);
    if (r) existing.add(id);
  }
  let next = lastFilledRow(colA) + 1;
  const plan = [];
  for (const id of issueIds) {
    if (existing.has(id)) plan.push({ issue_id: id, row: findIssueRow(colA, id), action: 'updated' });
    else plan.push({ issue_id: id, row: next++, action: 'appended' });
  }
  return plan;
}
