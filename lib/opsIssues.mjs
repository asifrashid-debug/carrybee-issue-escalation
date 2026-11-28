// Ops Issues tab (ISD, OSD, CTG sheets) and the three KAM tracker tabs (IR to KAM, TNL To KAM, Sort To KAM): pure logic shared by the sync job, the API routes and tests.
// No network or database calls here. lib/opsIssueSync.js does the I/O.
//
// Sheet tab 'Ops Issues', columns A to L (headers written live on 22 Nov 2026; column B added later):
//   A Issue ID (system-generated, unique)   B Issue Raise Time (set once by an Apps Script trigger; never written here)
//   C Consignment ID (optional)             D Merchant Name               E Issue Category (later)
//   F Issue Sub Category (later)            G HUB Feedback (HUB)          H HUB Name
//   I KAM Name (filled by sync from business_master.kam_name on a Merchant Name match)
//   J Issue Status                          K Validation (KAM)            L KAM Feedback (KAM, free text)
// M and N are formulas (Issue Pick SLA, Issue Resolution SLA) and O and P are hidden helpers. The sync never reads or writes them.

import { kamNames, CM_ROLES } from './roles.js';

export const OPS_SHEET = 'Ops Issues';
export const OPS_HEADERS = ['Issue ID', 'Issue Raise Time', 'Consignment ID', 'Merchant Name', 'Issue Category', 'Issue Sub Category', 'HUB Feedback', 'HUB Name', 'KAM Name', 'Issue Status', 'Validation', 'KAM Feedback'];
export const OPS_FIELDS = ['issue_id', 'raise_time', 'consignment_id', 'merchant_name', 'issue_category', 'issue_sub_category', 'hub_feedback', 'hub_name', 'kam_name', 'issue_status', 'validation', 'kam_feedback'];
export const COL = Object.fromEntries(OPS_FIELDS.map((f, i) => [f, i]));
export const KAM_FEEDBACK_MAX = 2000;

// Letter for a 0-based column index (0 -> A).
export function colLetter(i) { return String.fromCharCode(65 + i); }
// Sheet column letter for each field, derived from OPS_FIELDS. Use these, never a hard-coded letter.
export const L = Object.fromEntries(OPS_FIELDS.map((f, i) => [f, colLetter(i)]));
// Last column of the Ops Issues read range (L now). Formula and helper columns (M to P) are outside this range.
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
  // raise_time is stamped by the sheet's Apps Script and does not count as content.
  const hasContent = OPS_FIELDS.some((f) => f !== 'issue_id' && f !== 'raise_time' && o[f]);
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

// Sync sources. The three hub zones read 'Ops Issues' from their zone sheet (ID in SHEET_ISD, SHEET_OSD, SHEET_CTG).
// The three KAM tracker tabs sit in the response sheets, use the same layout (A to L read), and are synced and written back in place.
export const OPS_HUB_ZONES = ['ISD', 'OSD', 'CTG'];
export const OPS_TRACKER_TABS = { IR: 'IR to KAM', TNL: 'TNL To KAM', CENTRAL_SORT: 'Sort To KAM' };
export const OPS_TRACKER_SHEET_IDS = {
  IR: '1606K1lnLZWqIItWmu3_ap8ImrPaBZ6-6SoH_gYopKy4',
  TNL: '1SwKdLBVW56q9PpkbFNl3DSHUXpNeg6YLfNKSFamyqDU',
  CENTRAL_SORT: '1PgWZQG3lSSsCA8Ex9FudnffJesAqkOwzaf7VoFprO00',
};
export const OPS_SOURCE_KEYS = [...OPS_HUB_ZONES, ...Object.keys(OPS_TRACKER_TABS)];

// Tab name for a source key, or null for an unknown key.
export function tabForSource(key) {
  if (OPS_HUB_ZONES.includes(key)) return OPS_SHEET;
  return OPS_TRACKER_TABS[key] || null;
}

// Tabs on the OPS-KAM page. Each source tab shows the issues that came from one sheet. 'all' shows every issue.
export const OPS_SOURCE_TABS = [
  { key: 'all', label: 'All issues' },
  { key: 'hub', label: 'HUB Issues' },
  { key: 'ir', label: 'IR Issues' },
  { key: 'sort', label: 'Sort Issues' },
  { key: 'tnl', label: 'TNL Issues' },
];
// Source tab for a sync source key: the three hub zones are 'hub', then IR, CENTRAL_SORT (Sort) and TNL. Null for unknown keys.
export function opsSourceTabForKey(key) {
  if (OPS_HUB_ZONES.includes(key)) return 'hub';
  if (key === 'IR') return 'ir';
  if (key === 'CENTRAL_SORT') return 'sort';
  if (key === 'TNL') return 'tnl';
  return null;
}
// Source tab an issue belongs to, from its spreadsheet ID. sidByKey: { ISD, OSD, CTG, IR, TNL, CENTRAL_SORT: spreadsheetId }.
export function opsSourceTabForSheetId(sidByKey, sid) {
  if (!sid) return null;
  for (const [key, id] of Object.entries(sidByKey || {})) {
    if (id && id === sid) return opsSourceTabForKey(key);
  }
  return null;
}
// Adds `source` (one of the source tab keys, or null) to each issue, and drops the sheet ID from the output.
export function withOpsSource(issues, sidByKey) {
  return (issues || []).map(({ sheet_spreadsheet_id, ...rest }) => ({
    ...rest,
    source: opsSourceTabForSheetId(sidByKey, sheet_spreadsheet_id),
  }));
}
// True when an issue belongs in the given tab ('all' takes every issue).
export function inOpsSourceTab(issue, tab) {
  return tab === 'all' || issue?.source === tab;
}

// Tab name for a spreadsheet ID, given { sourceKey: spreadsheetId } for every source. Null when the ID is not a source.
export function tabForSheetId(sidByKey, sid) {
  if (!sid) return null;
  for (const [key, id] of Object.entries(sidByKey || {})) {
    if (id && id === sid) return tabForSource(key);
  }
  return null;
}

// Sort options for the OPS-KAM list. Newest first is the default.
export const OPS_SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];
// Sorts by raised_at. Issues with no valid raised time go last in both orders. Ties break by Issue ID. Returns a new array.
// Keys are computed once per row (Date.parse and the id string), not on every comparison. At 50,000 rows this is about 5x faster.
export function sortOpsIssues(issues, order = 'newest') {
  const dir = order === 'oldest' ? 1 : -1;
  const keyed = (issues || []).map((issue) => {
    const v = Date.parse(issue?.raised_at);
    return { issue, t: Number.isNaN(v) ? null : v, id: String(issue?.issue_id ?? '') };
  });
  // localeCompare only runs for ties, so the tie order is the same as before.
  keyed.sort((a, b) => {
    if (a.t === null && b.t === null) return a.id.localeCompare(b.id);
    if (a.t === null) return 1;
    if (b.t === null) return -1;
    if (a.t !== b.t) return (a.t - b.t) * dir;
    return a.id.localeCompare(b.id) * dir;
  });
  return keyed.map((k) => k.issue);
}
