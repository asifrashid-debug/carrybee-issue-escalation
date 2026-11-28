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

// IR team members for the Assigned IR Member dropdown (IR sheet column M). Strict: other values are rejected.
export const IR_MEMBERS = ['Md Saidul Islam Siam', 'Parves Moshraf', 'Juman Nokrak', 'Fuad Hassan', 'Md Al Abid'];

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

// Where an escalation goes. HUB, IR, Central Sort and TNL can be ticked in any combination (one Issue ID on each destination).
// The same boxes apply to KAM and MX escalations (the MX form shows them too). The MX CRM API does not use this
// function: lib/mxApi.mjs MX_ROUTES always sends the issue to HUB only.
export function routesFromBody(body) {
  return { hub: body.route_hub === true, ir: body.route_ir === true, central_sort: body.route_central_sort === true, tnl: body.route_tnl === true };
}

// Which route flag a list shows. Each route tab shows only the issues ticked for that route:
// IR -> route_ir, Central Sort -> route_central_sort, TNL -> route_tnl.
// The tracker (no route, or any other value) shows HUB-ticked issues only, so an issue ticked only for
// IR, Central Sort or TNL never appears in the tracker.
const ROUTE_LIST_COLUMN = { ir: 'route_ir', central_sort: 'route_central_sort', tnl: 'route_tnl' };
export function routeListFilter(route) {
  const column = Object.prototype.hasOwnProperty.call(ROUTE_LIST_COLUMN, route) ? ROUTE_LIST_COLUMN[route] : 'route_hub';
  return { column, value: true };
}

// True when the issue is IR only (IR ticked, HUB not ticked). Only these use the IR category list.
export function isIrOnlyRoute(routes) {
  return routes.ir === true && routes.hub !== true;
}

// Returns an error message, or null when at least one box is ticked.
export function routeError(routes) {
  if (!routes.hub && !routes.ir && !routes.central_sort && !routes.tnl) return 'Tick at least one box: HUB, IR, Central Sort or TNL.';
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

// Pick target: 24 hours from the raised time (business rule). IR_PICK_SLA_HOURS can override it.
// Resolve target: the category's IR resolve SLA in days (ir_resolve_sla_days on the issue), otherwise
// IR_RESOLVE_SLA_HOURS if it is set, otherwise null ("No SLA set").
export const IR_PICK_SLA_HOURS_DEFAULT = 24;
export function irTargetsFromEnv(env = process.env) {
  const num = (v) => (v === undefined || v === '' ? null : Number(v));
  const pick = num(env.IR_PICK_SLA_HOURS);
  return { pickHours: pick ?? IR_PICK_SLA_HOURS_DEFAULT, resolveHours: num(env.IR_RESOLVE_SLA_HOURS) };
}

// Resolve target in hours for one escalation: category days x 24 when set, else the environment value.
export function irResolveHours(e, env = process.env) {
  if (e.ir_resolve_sla_days != null && Number.isFinite(Number(e.ir_resolve_sla_days))) return Number(e.ir_resolve_sla_days) * 24;
  return irTargetsFromEnv(env).resolveHours;
}

// Status timestamps. Pick is set only when the status becomes Picked, and only the first time (kept after that).
// Other statuses (In Progress, Resolved) do not stop the pick clock. If Picked was skipped, the pick SLA stays Pending.
// Resolve is set when the status becomes Resolved, and cleared when it moves away, like Completed At.
export function irStatusStamps(cur, newStatus, nowIso) {
  const patch = {};
  if (newStatus === 'Picked' && !cur.ir_picked_at) patch.ir_picked_at = nowIso;
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
  const { pickHours } = irTargetsFromEnv(env);
  return {
    pick: irSlaCell(e.submitted_at, e.ir_picked_at, pickHours),
    resolve: irSlaCell(e.submitted_at, e.ir_resolved_at, irResolveHours(e, env)),
  };
}
