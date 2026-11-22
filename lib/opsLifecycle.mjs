// Ops Issues lifecycle: status, pick and resolve windows, KAM validation. Pure rules, no network or DB calls.
// Used by the sync job (lib/opsIssueSync.js), the PATCH route and the KAM Feedback tab.
//
// Flow (set by the KAM in the tracker, mirrored to sheet column H):
//   Raised  (automatic: the sync sets it when ops adds a new row)
//   -> Picked (KAM picks the issue)
//   -> In Progress
//   -> Resolved or Not Resolved (closes the issue)
// Windows, both counted from raised_at:
//   pick within 30 minutes; resolve (close) within 24 hours.
// A missed window is flagged in the tracker. It does not block the action.
// Validation (sheet column I) is set by the named KAM at any time: Valid, Invalid, Duplicate, No proper info.

export const RAISED = 'Raised';
export const STATUSES = ['Raised', 'Picked', 'In Progress', 'Resolved', 'Not Resolved'];
export const CLOSED_STATUSES = ['Resolved', 'Not Resolved'];
export const VALIDATIONS = ['Valid', 'Invalid', 'Duplicate', 'No proper info'];
export const PICK_WINDOW_MIN = 30;
export const RESOLVE_WINDOW_H = 24;

const MIN = 60e3;
const HOUR = 3600e3;
const ms = (t) => (t == null || t === '' ? null : new Date(t).getTime());
const iso = (t) => new Date(t).toISOString();

// action -> the status it moves from and to, the timestamp it sets, and the user it records (or null).
export const ACTIONS = {
  pick: { from: 'Raised', to: 'Picked', stamp: 'picked_at', by: 'picked_by' },
  start: { from: 'Picked', to: 'In Progress', stamp: 'in_progress_at', by: null },
  resolve: { from: 'In Progress', to: 'Resolved', stamp: 'closed_at', by: 'closed_by' },
  not_resolved: { from: 'In Progress', to: 'Not Resolved', stamp: 'closed_at', by: 'closed_by' },
};

// The deadlines for an issue raised at raisedAt (ISO string or Date).
export function windowsFrom(raisedAt) {
  const t = ms(raisedAt);
  return { pick_due_at: iso(t + PICK_WINDOW_MIN * MIN), resolve_due_at: iso(t + RESOLVE_WINDOW_H * HOUR) };
}

// Lifecycle fields for a new issue (the sync inserts these with the row).
export function newIssueLifecycle(now) {
  const raised = iso(now);
  return { issue_status: RAISED, raised_at: raised, ...windowsFrom(raised) };
}

// Applies a status action. Returns { error, status } or { from, patch, rollback, cells }.
//   patch: the ops_issues columns to set. rollback: the values to restore if the sheet write fails.
//   cells: the sheet cells to write (column H).
export function applyAction(issue, action, email, now) {
  if (!issue) return { status: 404, error: 'Issue not found' };
  const a = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!a) return { status: 400, error: 'Unknown action' };
  if (issue.issue_status !== a.from) {
    return { status: 409, error: `This issue is "${issue.issue_status || 'not raised'}". Moving to "${a.to}" needs it to be "${a.from}".` };
  }
  const patch = { issue_status: a.to, [a.stamp]: iso(now) };
  const rollback = { issue_status: a.from, [a.stamp]: null };
  if (a.by) { patch[a.by] = email; rollback[a.by] = null; }
  return { from: a.from, patch, rollback, cells: { H: a.to } };
}

// Applies a validation. Any time, by the named KAM. Returns { error, status } or { patch, rollback, cells }.
export function applyValidation(issue, value, email, now) {
  if (!issue) return { status: 404, error: 'Issue not found' };
  const v = String(value ?? '').trim();
  if (!VALIDATIONS.includes(v)) return { status: 400, error: `Validation must be one of: ${VALIDATIONS.join(', ')}` };
  return {
    patch: { validation: v, validated_at: iso(now), validated_by: email },
    rollback: { validation: issue.validation ?? null, validated_at: issue.validated_at ?? null, validated_by: issue.validated_by ?? null },
    cells: { I: v },
  };
}

// Where an issue stands against its two windows. Minutes are negative when overdue.
// pick:    n/a | pick_due | pick_overdue | picked_on_time | picked_late
// resolve: n/a | resolve_due | resolve_overdue | closed_on_time | closed_late
export function dueState(issue, now = new Date()) {
  const t = now.getTime();
  const raised = ms(issue?.raised_at);
  if (raised == null) return { pick: 'n/a', resolve: 'n/a', minutesToPick: null, hoursToResolve: null, overdue: false };
  const pickDue = ms(issue.pick_due_at);
  const resolveDue = ms(issue.resolve_due_at);
  let pick;
  if (issue.picked_at) pick = ms(issue.picked_at) > pickDue ? 'picked_late' : 'picked_on_time';
  else if (issue.issue_status !== RAISED) pick = 'n/a';
  else pick = t > pickDue ? 'pick_overdue' : 'pick_due';
  let resolve;
  if (CLOSED_STATUSES.includes(issue.issue_status)) resolve = ms(issue.closed_at) > resolveDue ? 'closed_late' : 'closed_on_time';
  else resolve = t > resolveDue ? 'resolve_overdue' : 'resolve_due';
  const open = !CLOSED_STATUSES.includes(issue.issue_status);
  return {
    pick,
    resolve,
    minutesToPick: pickDue == null ? null : Math.round((pickDue - t) / MIN),
    hoursToResolve: resolveDue == null ? null : Math.round(((resolveDue - t) / HOUR) * 10) / 10,
    overdue: open && (pick === 'pick_overdue' || resolve === 'resolve_overdue'),
  };
}

// Sync plan for one sheet row.
//   dbRow: the existing ops_issues row (or null when the Issue ID is new to the DB).
//   sheet: { issue_status, validation } as typed in the sheet.
// For a new row: status is Raised whatever the sheet says; lifecycle fields are inserted with the row.
// For an existing row: the DB is the source of truth for status and validation. The sheet cell is
// rewritten to match, and the DB values are never overwritten from the sheet.
export function planSyncLifecycle({ dbRow, sheet, now }) {
  if (!dbRow) {
    return {
      isNew: true,
      insert: newIssueLifecycle(now),
      validation: sheet.validation || null,
      sheetCells: sheet.issue_status === RAISED ? {} : { H: RAISED },
    };
  }
  // A row from before the lifecycle existed has no status. Give it Raised, with windows from its created_at.
  const backfill = dbRow.issue_status ? null : { issue_status: RAISED, raised_at: dbRow.created_at, ...windowsFrom(dbRow.created_at) };
  const status = dbRow.issue_status || RAISED;
  const validation = dbRow.validation ?? null;
  const sheetCells = {};
  if (String(sheet.issue_status || '') !== status) sheetCells.H = status;
  if (String(sheet.validation || '') !== String(validation || '')) sheetCells.I = validation || '';
  return { isNew: false, backfill, status, validation, sheetCells };
}
