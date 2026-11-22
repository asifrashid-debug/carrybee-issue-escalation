// Ops Issues tab (ISD, OSD, CTG sheets): pure logic shared by the sync job, the API routes and tests.
// No network or database calls here. lib/opsIssueSync.js does the I/O.
//
// Sheet tab 'Ops Issues', columns A to J (headers written live on 22 Nov 2026):
//   A Issue ID (system-generated, unique)   B Consignment ID (optional)   C Merchant Name
//   D Issue Category (later)                E Issue Sub Category (later)  F HUB Feedback (HUB)
//   G KAM Name (filled by sync from business_master.kam_name on a Merchant Name match)
//   H Issue Status                          I Validation (KAM)            J KAM Feedback (KAM, free text)

import { kamNames, CM_ROLES } from './roles.js';

export const OPS_SHEET = 'Ops Issues';
export const OPS_HEADERS = ['Issue ID', 'Consignment ID', 'Merchant Name', 'Issue Category', 'Issue Sub Category', 'HUB Feedback', 'HUB Name', 'KAM Name', 'Issue Status', 'Validation', 'KAM Feedback'];
export const OPS_FIELDS = ['issue_id', 'consignment_id', 'merchant_name', 'issue_category', 'issue_sub_category', 'hub_feedback', 'hub_name', 'kam_name', 'issue_status', 'validation', 'kam_feedback'];
export const COL = Object.fromEntries(OPS_FIELDS.map((f, i) => [f, i]));
export const KAM_FEEDBACK_MAX = 2000;

// Letter for a 0-based column index (0 -> A).
export function colLetter(i) { return String.fromCharCode(65 + i); }
// Sheet column letter for each field, derived from OPS_FIELDS. Use these, never a hard-coded letter.
export const L = Object.fromEntries(OPS_FIELDS.map((f, i) => [f, colLetter(i)]));
// Last column of the Ops Issues sheet (K now).
export const OPS_LAST_COL = colLetter(OPS_FIELDS.length - 1);

export const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// business_master rows -> Map(normalised business_name -> kam_name).
// Inactive rows and rows with no KAM are skipped. A name that maps to two different KAMs is stored as null (ambiguous) and is never filled.
export function buildKamIndex(masterRows) {
  const map = new Map();
  for (const r of masterRows || []) {
    if (r.is_active === false) continue;
    const key = normName(r.business_name);
    const kam = clean(r.kam_name);
    if (!key || !kam) continue;
    if (!map.has(key)) map.set(key, kam);
    else if (normName(map.get(key)) !== normName(kam)) map.set(key, null);
  }
  return map;
}

// Returns { kam, status }: status is 'matched', 'ambiguous', 'not_found' or 'no_merchant'.
export function lookupKam(index, merchantName) {
  const key = normName(merchantName);
  if (!key) return { kam: '', status: 'no_merchant' };
  if (!index.has(key)) return { kam: '', status: 'not_found' };
  const kam = index.get(key);
  if (!kam) return { kam: '', status: 'ambiguous' };
  return { kam, status: 'matched' };
}

// One sheet row (array of cells, A first) -> object keyed by field name. Missing cells are ''.
export function parseOpsRow(row) {
  const o = {};
  for (const f of OPS_FIELDS) o[f] = clean(row?.[COL[f]]);
  return o;
}

// Sync plan for one parsed row. Returns { skip: true } for rows with nothing in them.
// actions.needsId: the Issue ID cell is blank, so the system must assign one.
// actions.kam_name: the KAM Name to write into column G (only when it differs from the sheet).
export function planOpsRow(o, index) {
  const hasContent = OPS_FIELDS.some((f) => f !== 'issue_id' && o[f]);
  if (!hasContent) return { skip: true, actions: {}, kamStatus: 'skip' };
  const actions = {};
  if (!o.issue_id) actions.needsId = true;
  const look = lookupKam(index, o.merchant_name);
  if (look.status === 'matched' && normName(look.kam) !== normName(o.kam_name)) actions.kam_name = look.kam;
  return { skip: false, actions, kamStatus: look.status };
}

// Final DB record for one sheet row. kamName is the value after planOpsRow (the matched KAM, or the sheet value).
// KAM Feedback: the sheet cell wins when it is filled. When the sheet cell is blank, keep the value already in the DB (passed as dbFeedback).
export function toDbRecord(o, { issueId, kamName, dbFeedback = null, sid, rowNumber }) {
  return {
    issue_id: issueId,
    consignment_id: o.consignment_id || null,
    merchant_name: o.merchant_name || null,
    issue_category: o.issue_category || null,
    issue_sub_category: o.issue_sub_category || null,
    hub_feedback: o.hub_feedback || null,
    hub_name: o.hub_name || null,
    kam_name: kamName || null,
    issue_status: o.issue_status || null,
    validation: o.validation || null,
    kam_feedback: o.kam_feedback || dbFeedback || null,
    sheet_spreadsheet_id: sid,
    sheet_row_number: rowNumber,
  };
}

// Only the issues whose KAM Name matches the viewer's own names (display name plus kam_aliases).
// Admins see every issue. Their feedback box stays read-only (see canEditKamFeedback).
// CM members and the CM lead also see the CM queue (KAM Name 'CM'). They can act only on issues named to them.
export function visibleOpsIssues(user, issues) {
  if (!user) return [];
  if (user.role === 'admin') return issues || [];
  const names = new Set(kamNames(user));
  const seesCmQueue = CM_ROLES.includes(user.role);
  if (names.size === 0 && !seesCmQueue) return [];
  return (issues || []).filter((i) => {
    const k = normName(i.kam_name);
    return names.has(k) || (seesCmQueue && k === 'cm');
  });
}

// Database pre-filter for the Ops-KAM list (ops_issues.kam_name). It must never drop a row that visibleOpsIssues
// would keep, so it is looser than that rule: case and whitespace inside a name are matched with a wildcard, and the
// characters that are special in a PostgREST or() (or in a LIKE pattern) become wildcards too.
// PostgREST uses * as the wildcard in like/ilike (it is sent as % to SQL), so * is used here.
// visibleOpsIssues still runs afterwards.
// Returns null when no filter is needed (admin), [] when the user sees no issues, else the ilike patterns.
export function opsKamPatterns(user) {
  if (!user) return [];
  if (user.role === 'admin') return null;
  const names = kamNames(user);
  const seesCmQueue = CM_ROLES.includes(user.role);
  if (names.length === 0 && !seesCmQueue) return [];
  const pats = names.map(likePattern);
  if (seesCmQueue) pats.push(likePattern('cm'));
  return pats;
}
function likePattern(name) {
  const words = normName(name).split(' ').filter(Boolean).map((w) => w.replace(/[",()\\%_*]/g, '*'));
  return `"*${words.join('*')}*"`;
}

// Only the KAM the issue is named to can write KAM Feedback. Admin cannot.
export function canEditKamFeedback(user, issue) {
  if (!user || !issue || user.role === 'admin') return false;
  return kamNames(user).includes(normName(issue.kam_name));
}

// KAM Feedback is free text. Empty clears the field (stored as null).
export function cleanKamFeedback(text) {
  if (text === null || text === undefined) return { value: null };
  if (typeof text !== 'string') return { error: 'KAM Feedback must be text' };
  const t = text.trim();
  if (t.length > KAM_FEEDBACK_MAX) return { error: `KAM Feedback is limited to ${KAM_FEEDBACK_MAX} characters` };
  return { value: t === '' ? null : t };
}

// Adds `zone` to each Ops Issue from hub_master (matched on hub_name). Zone is the sheet the issue came from (ISD, OSD or CTG).
// No hub, or a hub that is not in hub_master, gives zone null. Pure: no network calls.
export function withHubZone(issues, hubs) {
  const zoneByHub = new Map((hubs || []).map((h) => [normName(h.hub_name), h.zone || null]));
  return (issues || []).map((i) => ({
    ...i,
    zone: i.hub_name ? (zoneByHub.get(normName(i.hub_name)) ?? null) : null,
  }));
}
