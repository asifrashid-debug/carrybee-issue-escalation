// IR Issue Escalation: pure rules (no network, no database). Used by the KAM form, the escalation API,
// the IR sheet writer and the IR webhook. Tested in tests/irEscalation.test.mjs.
import { formatDhaka } from './time.js';

// The IR sheet, columns A-R, in this order (row 1 of the sheet tab "Active").
export const IR_HEADERS = [
  'Issue ID', 'Date and Time of Issue Escalation', 'CID', 'Merchant Name', 'HUB Name', 'Zone',
  'Issue Category', 'Issue Sub Category', 'Mail Subject Line', 'Issue Details', 'Drive Link',
  'Status From KAM', 'Assigned IR Member', 'Feedback from IR', 'Feedback from IR Lead', 'IR Status',
  'IR Pick SLA', 'IR Resolve SLA',
];

// Dropdown values for IR Status. "Picked" starts the IR pick SLA. "Resolved" stops the IR resolve SLA.
export const IR_STATUSES = ['Open', 'Picked', 'In Progress', 'Resolved'];

// Columns the IR team edits in the IR sheet (webhook fields). Drive Link is written only by the tracker.
export const IR_EDITABLE_FIELDS = {
  'Status From KAM': 'ir_kam_status',
  'Assigned IR Member': 'ir_assigned_member',
  'Feedback from IR': 'ir_feedback',
  'Feedback from IR Lead': 'ir_lead_feedback',
  'IR Status': 'ir_status',
};

export const IR_MAIL_SUBJECT_MAX = 200;
export const IR_MAX_FILES = 10;
export const IR_MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB total, before zipping

// Where an escalation goes. Hub and IR can both be ticked (one Issue ID on each destination).
// Sort/TNL is stored only: its routing is not decided yet.
// Non-KAM (MX) escalations always go to the hub response sheet, as before.
export function routesFromBody(body, channel) {
  if (channel !== 'KAM') return { hub: true, ir: false, sort_tnl: false };
  return { hub: body.route_hub === true, ir: body.route_ir === true, sort_tnl: body.route_sort_tnl === true };
}

// Returns an error message, or null when at least one box is ticked.
export function routeError(routes) {
  if (!routes.hub && !routes.ir && !routes.sort_tnl) return 'Tick at least one box: HUB, IR or Sort/TNL.';
  return null;
}

// Attachments are only accepted for IR issues.
export function attachmentError(routes, files) {
  if (!files.length) return null;
  if (!routes.ir) return 'Attachments are only accepted when the IR box is ticked.';
  if (files.length > IR_MAX_FILES) return `Attach at most ${IR_MAX_FILES} files.`;
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  if (total > IR_MAX_TOTAL_BYTES) return 'Attachments are larger than 20 MB in total.';
  return null;
}

// Mail subject for IR issues: optional, trimmed, capped. Empty becomes null.
export function cleanMailSubject(v) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, IR_MAIL_SUBJECT_MAX) : null;
}

// Name of the zip file that holds the IR attachments, for example CB-25-11-ABCD_attachments.zip.
export function attachmentZipName(issueId) {
  return `${issueId}_attachments.zip`;
}

// SLA cell for IR. Start = the issue raised time. End = the time the IR status was reached (picked or resolved).
// targetHours = null means the target is not set yet, so the cell says "No SLA set" instead of guessing.
// Clock hours for now. Office hours can be added here later if the user asks for them.
export function irSlaCell(raisedIso, doneIso, targetHours) {
  if (!doneIso) return 'Pending';
  if (targetHours == null || !Number.isFinite(Number(targetHours))) return 'No SLA set';
  const hours = (new Date(doneIso).getTime() - new Date(raisedIso).getTime()) / 3600e3;
  return hours <= Number(targetHours) ? 'Within SLA' : 'Breached';
}

// Targets come from the environment (IR_PICK_SLA_HOURS, IR_RESOLVE_SLA_HOURS). Unset means null.
export function irTargetsFromEnv(env = process.env) {
  const num = (v) => (v === undefined || v === '' ? null : Number(v));
  return { pickHours: num(env.IR_PICK_SLA_HOURS), resolveHours: num(env.IR_RESOLVE_SLA_HOURS) };
}

// Status timestamps. Pick is set once, the first time the status is Picked (kept after that).
// Resolve is set when the status becomes Resolved, and cleared when it moves away, like Completed At.
export function irStatusStamps(cur, newStatus, nowIso) {
  const patch = {};
  if (newStatus === 'Picked' || newStatus === 'In Progress' || newStatus === 'Resolved') {
    if (!cur.ir_picked_at) patch.ir_picked_at = nowIso;
  }
  if (newStatus === 'Resolved') patch.ir_resolved_at = cur.ir_resolved_at || nowIso;
  else patch.ir_resolved_at = null;
  return patch;
}

// One sheet row (18 values, A-R) for an IR escalation. `slas` = { pick, resolve } cells, computed by irSlaCell.
export function irRowFromEsc(e, slas) {
  return [
    e.issue_id,
    formatDhaka(e.submitted_at),
    e.consignment_id || '',
    e.merchant_name || '',
    e.concern_hub || '',
    e.zone || '',
    e.issue_category || '',
    e.issue_sub_category || '',
    e.mail_subject || '',
    e.issue_details || '',
    e.drive_link || '',
    e.ir_kam_status || '',
    e.ir_assigned_member || '',
    e.ir_feedback || '',
    e.ir_lead_feedback || '',
    e.ir_status || '',
    slas.pick,
    slas.resolve,
  ];
}

// Computes both SLA cells for one escalation, using the targets from the environment.
export function irSlaCells(e, env = process.env) {
  const { pickHours, resolveHours } = irTargetsFromEnv(env);
  return {
    pick: irSlaCell(e.submitted_at, e.ir_picked_at, pickHours),
    resolve: irSlaCell(e.submitted_at, e.ir_resolved_at, resolveHours),
  };
}
