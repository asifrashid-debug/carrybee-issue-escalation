// Ops Issues lifecycle: status, pick and resolve windows, KAM validation. Pure rules, no network or DB calls.
// Used by the sync job (lib/opsIssueSync.js), the PATCH route and the KAM Feedback tab.
//
// Flow (set by the KAM in the tracker, mirrored to the sheet's Issue Status column):
//   Raised  (automatic: the sync sets it when ops adds a new row)
//   -> Picked (KAM picks the issue)
//   -> In Progress
//   -> Resolved or Not Resolved (closes the issue)
// Pick window: 1 office hour, counted from the Active-tab clock start (see lib/responseWithin.mjs):
//   raised 00:00-11:59 starts 12:00 the same day; 12:00-19:59 starts at once; 20:00+ starts 12:00 the next day.
//   Office hours are 10:00-20:00 Asia/Dhaka, every day.
// KAM feedback: 2 office hours from the clock start. Team Lead feedback: 2 office hours after the KAM deadline.
// Resolve (close) window: 24 hours from raised_at (unchanged).
// A missed window is flagged in the tracker. It does not block the action.
// Validation (sheet column K) is set by the named KAM at any time: Valid, Invalid, Duplicate, No proper info.

import { L, TEAM_LEAD_FEEDBACK_MAX, HELPER_PICK_COL, HELPER_CLOSE_COL, sheetSerial } from './opsIssues.mjs';
import { layerClockStart, addOfficeHours } from './responseWithin.mjs';

export const RAISED = 'Raised';
export const STATUSES = ['Raised', 'Picked', 'In Progress', 'Resolved', 'Not Resolved'];
export const CLOSED_STATUSES = ['Resolved', 'Not Resolved'];
export const VALIDATIONS = ['Valid', 'Invalid', 'Duplicate', 'No proper info'];
export const PICK_WINDOW_OFFICE_H = 1;
export const KAM_FEEDBACK_OFFICE_H = 2;
export const TEAM_LEAD_OFFICE_H = 2;
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
  const d = opsDeadlines(raisedAt);
  return { pick_due_at: d.pick_due_at, resolve_due_at: iso(t + RESOLVE_WINDOW_H * HOUR) };
}

// Office-hour deadlines (ISO strings), or nulls when raisedAt is not a valid time.
//   pick_due_at: clock start + 1 office hour.   kam_due_at: clock start + 2 office hours.
//   tl_due_at: KAM deadline + 2 office hours.
export function opsDeadlines(raisedAt) {
  const start = layerClockStart(raisedAt);
  if (start == null) return { start: null, pick_due_at: null, kam_due_at: null, tl_due_at: null };
  const pick = addOfficeHours(start, PICK_WINDOW_OFFICE_H);
  const kam = addOfficeHours(start, KAM_FEEDBACK_OFFICE_H);
  const tl = addOfficeHours(kam, TEAM_LEAD_OFFICE_H);
  return { start: iso(start), pick_due_at: iso(pick), kam_due_at: iso(kam), tl_due_at: iso(tl) };
}

// Team Lead activation. Active only when the KAM missed BOTH the pick deadline and the KAM feedback deadline.
//   pick missed: picked_at is after the pick deadline, or, with no picked_at, the status is still Raised past it.
//   feedback missed: no KAM feedback and now is past the KAM deadline.
export function teamLeadState(issue, now = new Date()) {
  const t = now.getTime();
  const d = opsDeadlines(issue?.raised_at);
  if (d.start == null) return { pick_missed: false, feedback_missed: false, active: false, kam_due_at: null, tl_due_at: null };
  const pickDue = ms(d.pick_due_at);
  const kamDue = ms(d.kam_due_at);
  const pickMissed = issue.picked_at ? ms(issue.picked_at) > pickDue : (issue.issue_status === RAISED && t > pickDue);
  const feedbackMissed = !issue.kam_feedback && t > kamDue;
  return {
    pick_missed: pickMissed,
    feedback_missed: feedbackMissed,
    active: pickMissed && feedbackMissed,
    kam_due_at: d.kam_due_at,
    tl_due_at: d.tl_due_at,
  };
}

// Dhaka label for a deadline. Same day as the raise: "h:mm AM/PM". Another day: "d mmm h:mm AM/PM". Mirrors the sheet formula.
const dhakaTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', hour12: true });
const dhakaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });
const dhakaDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' });
export function deadlineLabel(deadlineIso, raisedAt) {
  const d = new Date(deadlineIso);
  const time = dhakaTime.format(d).replace(' AM', ' AM').replace(' PM', ' PM');
  if (dhakaDay.format(d) === dhakaDay.format(new Date(raisedAt))) return time;
  return `${dhakaDate.format(d)} ${time}`;
}

// The Response Within text for an Ops Issue. Checked in order:
//   KAM feedback or Team Lead feedback filled -> "Responded"
//   now on or before the KAM deadline         -> "KAM needs to provide feedback by <time>"
//   Team Lead active and now on or before the Team Lead deadline -> "Team Lead feedback by <time>"
//   Team Lead active and past the Team Lead deadline -> "Overdue"
//   KAM deadline passed, Team Lead not active (picked on time) -> "KAM feedback overdue"
export function responseWithinOps(issue, now = new Date()) {
  if (issue?.kam_feedback || issue?.team_lead_feedback) return 'Responded';
  const tl = teamLeadState(issue, now);
  if (tl.kam_due_at == null) return '';
  const t = now.getTime();
  if (t <= ms(tl.kam_due_at)) return `KAM needs to provide feedback by ${deadlineLabel(tl.kam_due_at, issue.raised_at)}`;
  if (!tl.active) return 'KAM feedback overdue';
  if (t <= ms(tl.tl_due_at)) return `Team Lead feedback by ${deadlineLabel(tl.tl_due_at, issue.raised_at)}`;
  return 'Overdue';
}

// Lifecycle fields for a new issue (the sync inserts these with the row).
export function newIssueLifecycle(now) {
  const raised = iso(now);
  return { issue_status: RAISED, raised_at: raised, ...windowsFrom(raised) };
}

// Applies a status action. Returns { error, status } or { from, patch, rollback, cells }.
//   patch: the ops_issues columns to set. rollback: the values to restore if the sheet write fails.
//   cells: the sheet cells to write (the Issue Status column, looked up from L, plus the Q or R helper stamp).
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
  // Helper stamp for the sheet: Q (Pick Done At) on pick, R (Resolved At) on close. Written with the status cell.
  const cells = { [L.issue_status]: a.to };
  if (action === 'pick') cells[HELPER_PICK_COL] = sheetSerial(now);
  else cells[HELPER_CLOSE_COL] = sheetSerial(now);
  return { from: a.from, patch, rollback, cells };
}

// Applies a validation. Any time, by the named KAM. Returns { error, status } or { patch, rollback, cells }.
export function applyValidation(issue, value, email, now) {
  if (!issue) return { status: 404, error: 'Issue not found' };
  const v = String(value ?? '').trim();
  if (!VALIDATIONS.includes(v)) return { status: 400, error: `Validation must be one of: ${VALIDATIONS.join(', ')}` };
  return {
    patch: { validation: v, validated_at: iso(now), validated_by: email },
    rollback: { validation: issue.validation ?? null, validated_at: issue.validated_at ?? null, validated_by: issue.validated_by ?? null },
    cells: { [L.validation]: v },
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
      sheetCells: sheet.issue_status === RAISED ? {} : { [L.issue_status]: RAISED },
    };
  }
  // A row from before the lifecycle existed has no status. Give it Raised, with windows from its created_at.
  const backfill = dbRow.issue_status ? null : { issue_status: RAISED, raised_at: dbRow.created_at, ...windowsFrom(dbRow.created_at) };
  const status = dbRow.issue_status || RAISED;
  const validation = dbRow.validation ?? null;
  const sheetCells = {};
  if (String(sheet.issue_status || '') !== status) sheetCells[L.issue_status] = status;
  if (String(sheet.validation || '') !== String(validation || '')) sheetCells[L.validation] = validation || '';
  // Helper stamps: where the DB has the time and the sheet helper cell is blank, copy it across (for example rows
  // changed before the app wrote the helpers). A helper cell that already has a value is never overwritten.
  if (dbRow.picked_at && !String(sheet.pick_done || '').trim()) sheetCells[HELPER_PICK_COL] = sheetSerial(dbRow.picked_at);
  if (dbRow.closed_at && !String(sheet.resolved || '').trim()) sheetCells[HELPER_CLOSE_COL] = sheetSerial(dbRow.closed_at);
  return { isNew: false, backfill, status, validation, sheetCells };
}
