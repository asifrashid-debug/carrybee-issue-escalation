import { google } from 'googleapis';
import { supabaseAdmin } from './supabase.js';
import { lastFilledRow, findIssueRow, planAppend, cellText } from './sheetRows.js';
import { officeHoursBetween } from './officeHours.js';

// Sheet layout A-AI (35 cols). Final Response is column T, right after Layer 3. Derived cells are the last three (AG-AI). Layer cells replace old Comments 1/2.
export const COLS = ['issue_id','submitted_at','email','consignment_id','merchant_name','channel','zone','concern_hub','issue_status','issue_category','issue_sub_category','issue_details','kam_name','week','priority_scale','kam_feedback_status','layer1_response','layer2_response','layer3_response','final_response','response_within','ops_issue_status','remarks','regional_lead','issue_response_datetime','division','ops_status','validation','ops_category','row_version','last_synced_at','completed_at','issue_pick_check','issue_resolution_check','overall_validation'];
export const HEADERS = ['Issue ID','Timestamp','Email Address','Consignment ID','Merchant Name','Channel','Zone','Concern Hub','Issue Status','Issue Category','Issue Sub Category','Issue Details','KAM Name','Week','Priority Scale','KAM Feedback Status','Layer 1 Response (HUB Incharge)','Layer 2 Response (Cluster Lead)','Layer 3 Response (Regional Lead)','Final Response','Response Within','ISSUE STATUS','Remarks','Regional Lead','Issue Response Date & Time','Division','Ops Status','Validation','Issue Category (Ops Type)','Row Version','Last Synced At','Completed At','Issue Pick','Issue Resolution','Overall Validation'];

export function sheetIdForZone(zone) {
  const map = { ISD: process.env.SHEET_ISD, OSD: process.env.SHEET_OSD, CTG: process.env.SHEET_CTG };
  return map[zone];
}
// Google access uses OAuth as the sheet owner (refresh token), not a service account.
// The same client serves Sheets and (for IR attachments) Drive. Drive needs the drive.file scope on the refresh token.
export function getGoogleAuth() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN not set — sheet sync queued');
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}
export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getGoogleAuth() });
}
function fmtDhaka(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dhaka = new Date(d.getTime() + (6*60 + d.getTimezoneOffset())*60000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(dhaka.getUTCDate()).padStart(2,'0');
  const mmm = months[dhaka.getUTCMonth()];
  const yyyy = dhaka.getUTCFullYear();
  let h = dhaka.getUTCHours();
  const mm = String(dhaka.getUTCMinutes()).padStart(2,'0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${dd}-${mmm}-${yyyy} ${String(h).padStart(2,'0')}:${mm} ${ampm}`;
}
// Writes a row around column U (index 20 = U). The sheet formula in U must survive every app write.
export function rowRanges(sheetRow, row) {
  return [
    { range: `Active!A${sheetRow}:T${sheetRow}`, values: [row.slice(0, 20)] },
    { range: `Active!V${sheetRow}:AI${sheetRow}`, values: [row.slice(21)] },
  ];
}

export function escToRow(e) {
  return [e.issue_id, fmtDhaka(e.submitted_at), e.email, e.consignment_id||'', e.merchant_name||'', e.channel, e.zone, e.concern_hub, e.issue_status, e.issue_category, e.issue_sub_category, e.issue_details, e.kam_name||'', e.week, e.priority_scale, e.kam_feedback_status, e.layer1_response||'', e.layer2_response||'', e.layer3_response||'', e.final_response||'', '', e.ops_issue_status, e.remarks||'', e.regional_lead||'', fmtDhaka(e.issue_response_datetime), e.division||'', e.ops_status, e.validation||'', e.ops_category||'', String(e.row_version||1), fmtDhaka(e.last_synced_at||new Date().toISOString()), fmtDhaka(e.completed_at), ...(e._derived || derivedCells(e, null))];
}

// Column U (Response Within) is a sheet formula (live, uses NOW()). The app never writes U: rowRanges() skips it.
// Derived sheet columns AG-AI. Pick: first hub response (issue_response_datetime, Y) against 2 office hours.
// Resolution: completed_at minus submitted_at against the category SLA for the zone (category_master sla_isd/osd/ctg, in days).
// Overall: 'No Further Escalation' only when KAM feedback is Resolved and ops status is Completed.
const H_MS = 3600e3;
const PICK_SLA_HOURS = 2;
const ZONE_SLA_COL = { ISD: 'sla_isd', OSD: 'sla_osd', CTG: 'sla_ctg' };

export function derivedCells(e, slaHours) {
  const raised = new Date(e.submitted_at).getTime();
  // AG (Issue Pick) is timed from the hub response (issue_response_datetime). U (issue_pick_time) is not used here.
  // Office hours only: 10:00-20:00 Asia/Dhaka, every day. An issue raised after 20:00 starts counting at 10:00 the next day.
  const pickCell = !e.issue_response_datetime ? 'Pending'
    : (officeHoursBetween(e.submitted_at, e.issue_response_datetime) <= PICK_SLA_HOURS ? 'Within SLA' : 'Breached');
  let resCell;
  if (!e.completed_at) resCell = 'Pending';
  else if (slaHours == null) resCell = 'No SLA set';
  else resCell = ((new Date(e.completed_at).getTime() - raised) / H_MS <= slaHours ? 'Within SLA' : 'Breached');
  const overallCell = e.kam_feedback_status === 'Resolved' && e.ops_status === 'Completed'
    ? 'No Further Escalation' : 'escalation needed';
  return [pickCell, resCell, overallCell];
}

// Adds _derived (AG-AI values) to an escalation, reading its category SLA from category_master.
export async function withDerived(e) {
  let slaHours = null;
  const col = ZONE_SLA_COL[e.zone];
  if (col && e.issue_category) {
    let q = supabaseAdmin().from('category_master').select(col).eq('category', e.issue_category).eq('side', 'requester').eq('is_active', true);
    q = e.issue_sub_category ? q.eq('sub_category', e.issue_sub_category) : q.is('sub_category', null);
    const { data } = await q.limit(1);
    const n = Number(data?.[0]?.[col]);
    // category_master sla_isd/osd/ctg are in DAYS (matches lib/categorySla.js); convert to hours.
    if (Number.isFinite(n) && n > 0) slaHours = n * 24;
  }
  return { ...e, _derived: derivedCells(e, slaHours) };
}
// Issues that are not routed to the hub sheet (IR-only, Sort/TNL-only) never get a zone row.
export async function pushToSheet(input) {
  if (input.route_hub === false) return { row: null, action: 'skipped' };
  const esc = await withDerived(input);
  const sid = sheetIdForZone(esc.zone);
  if (!sid) throw new Error(`No sheet for zone ${esc.zone}`);
  const sheets = getSheetsClient();
  // Idempotent: search by Issue ID in col A
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A:A' });
  const rows = res.data.values || [];
  const found = findIssueRow(rows, esc.issue_id);
  const row = escToRow(esc);
  if (found) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sid, requestBody: { valueInputOption: 'USER_ENTERED', data: rowRanges(found, row) } });
    return { row: found, action: 'updated' };
  } else {
    // Next row = after the last row with an Issue ID (not rows.length + 1, which depends on how the API trims blanks).
    const nextRow = lastFilledRow(rows) + 1;
    // Explicit row write: values.append shifted rows into the derived columns on the live sheets.
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sid, requestBody: { valueInputOption: 'USER_ENTERED', data: rowRanges(nextRow, row) } });
    const check = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: `Active!A${nextRow}` });
    if (cellText([check.data.values?.[0]?.[0]]) !== esc.issue_id) throw new Error(`Row ${nextRow} write not confirmed for ${esc.issue_id}`);
    return { row: nextRow, action: 'appended' };
  }
}

// Writes a batch of issues (OLD and new) to one zone's Active tab in one pass.
// Reads column A once, plans the rows (planAppend), writes them in one batchUpdate, then reads back to confirm.
// Returns [{ issue_id, row, action }]. Callers must pass escalations with _derived already set (withDerived).
export async function appendLegacyRows(zone, escs) {
  if (!escs.length) return [];
  const sid = sheetIdForZone(zone);
  if (!sid) throw new Error(`No sheet for zone ${zone}`);
  const sheets = getSheetsClient();
  const read = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A:A' });
  const colA = read.data.values || [];
  const plan = planAppend(colA, escs.map(e => e.issue_id));
  const byId = new Map(escs.map(e => [e.issue_id, e]));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: plan.flatMap(p => rowRanges(p.row, escToRow(byId.get(p.issue_id)))),
    },
  });
  const after = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A:A' });
  const colAfter = after.data.values || [];
  for (const p of plan) {
    if (findIssueRow(colAfter, p.issue_id) !== p.row) throw new Error(`Write check failed for ${p.issue_id} at row ${p.row}`);
  }
  return plan;
}
// 0-based column index -> A1 column letters (0 -> A, 25 -> Z, 26 -> AA, 30 -> AE).
export function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Cells to write for the changed DB fields, using the same formatting as a full row.
// row_version and last_synced_at are always included so reconcile stays accurate.
export function cellPlan(esc, fields) {
  const row = escToRow(esc);
  const wanted = new Set([...(fields || []), 'row_version', 'last_synced_at', 'issue_pick_check', 'issue_resolution_check', 'overall_validation']);
  return COLS
    .map((field, idx) => ({ field, idx }))
    .filter(({ field }) => wanted.has(field))
    .map(({ field, idx }) => ({ field, col: colLetter(idx), value: row[idx] }));
}

// Write only the changed cells of an existing row, so a stale DB value cannot overwrite
// a hub edit in another column. Falls back to a full append if the Issue ID is not on the sheet yet.
export async function pushFields(input, fields) {
  if (input.route_hub === false) return { row: null, action: 'skipped' };
  const esc = await withDerived(input);
  const sid = sheetIdForZone(esc.zone);
  if (!sid) throw new Error(`No sheet for zone ${esc.zone}`);
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A:A' });
  const rows = res.data.values || [];
  const rowNum = findIssueRow(rows, esc.issue_id);
  if (!rowNum) return pushToSheet(input);
  const plan = cellPlan(esc, fields);
  if (plan.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sid,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: plan.map(c => ({ range: `Active!${c.col}${rowNum}`, values: [[c.value]] }))
      }
    });
  }
  return { row: rowNum, action: 'cells', fields: plan.map(c => c.field) };
}

export async function readSheetOps(sid) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A1:AI5000' });
  return res.data.values || [];
}

// Read-only: returns every row of one tab (used by the KAM funnel upload). Never writes to the sheet.
export async function readSheetTab(sid, tab) {
  const sheets = getSheetsClient();
  const safeTab = String(tab).replace(/'/g, "''");
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: `'${safeTab}'!A:D`, valueRenderOption: 'FORMATTED_VALUE' });
  return res.data.values || [];
}

// One-time backfill of Layer 1 (column Q) and Layer 2 (column R) on existing Active rows.
// items: [{ id, row, layer1, layer2 }]. A cell is written only if it is blank and column A still holds the same
// Issue ID at that row. Never appends, never overwrites a hub value. Values are RAW so nothing is parsed as a formula.
export async function fillLayerCells(zone, items) {
  const sid = sheetIdForZone(zone);
  if (!sid) throw new Error(`No sheet for zone ${zone}`);
  const sheets = getSheetsClient();
  const result = { written: [], skipped: [], mismatch: [] };
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const got = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sid, ranges: chunk.map((it) => `Active!A${it.row}:R${it.row}`),
    });
    const data = [];
    (got.data.valueRanges || []).forEach((vr, k) => {
      const it = chunk[k];
      const cur = (vr.values && vr.values[0]) || [];
      if (String(cur[0] || '').trim() !== it.id) { result.mismatch.push(it.id); return; }
      const fields = [];
      if (it.layer1 && !String(cur[16] || '').trim()) { data.push({ range: `Active!Q${it.row}`, values: [[it.layer1]] }); fields.push('layer1'); }
      if (it.layer2 && !String(cur[17] || '').trim()) { data.push({ range: `Active!R${it.row}`, values: [[it.layer2]] }); fields.push('layer2'); }
      (fields.length ? result.written : result.skipped).push({ id: it.id, fields });
    });
    if (data.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sid, requestBody: { valueInputOption: 'RAW', data },
      });
    }
  }
  return result;
}
