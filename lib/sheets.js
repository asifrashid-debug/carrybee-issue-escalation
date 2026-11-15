import { google } from 'googleapis';

// Sheet layout A-AD (30 cols) — see README mapping. Layer cells replace old Comments 1/2.
export const COLS = ['issue_id','submitted_at','email','consignment_id','merchant_name','channel','zone','concern_hub','issue_status','issue_category','issue_sub_category','issue_details','kam_name','week','priority_scale','kam_feedback_status','layer1_response','layer2_response','layer3_response','issue_pick_time','ops_issue_status','remarks','regional_lead','issue_response_datetime','division','ops_status','validation','ops_category','row_version','last_synced_at','completed_at'];
export const HEADERS = ['Issue ID','Timestamp','Email Address','Consignment ID','Merchant Name','Channel','Zone','Concern Hub','Issue Status','Issue Category','Issue Sub Category','Issue Details','KAM Name','Week','Priority Scale','KAM Feedback Status','Layer 1 Response (HUB Incharge)','Layer 2 Response (Cluster Lead)','Layer 3 Response (Regional Lead)','Issue Pick Time','ISSUE STATUS','Remarks','Regional Lead','Issue Response Date & Time','Division','Ops Status','Validation','Issue Category (Ops Type)','Row Version','Last Synced At','Completed At'];

function sheetIdForZone(zone) {
  const map = { ISD: process.env.SHEET_ISD, OSD: process.env.SHEET_OSD, CTG: process.env.SHEET_CTG };
  return map[zone];
}
// Sheets access uses OAuth as the sheet owner (refresh token), not a service account.
function getSheetsClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN not set — sheet sync queued');
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: 'v4', auth });
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
export function escToRow(e) {
  return [e.issue_id, fmtDhaka(e.submitted_at), e.email, e.consignment_id||'', e.merchant_name||'', e.channel, e.zone, e.concern_hub, e.issue_status, e.issue_category, e.issue_sub_category, e.issue_details, e.kam_name||'', e.week, e.priority_scale, e.kam_feedback_status, e.layer1_response||'', e.layer2_response||'', e.layer3_response||'', fmtDhaka(e.issue_pick_time), e.ops_issue_status, e.remarks||'', e.regional_lead||'', fmtDhaka(e.issue_response_datetime), e.division||'', e.ops_status, e.validation||'', e.ops_category||'', String(e.row_version||1), fmtDhaka(e.last_synced_at||new Date().toISOString()), fmtDhaka(e.completed_at)];
}
export async function pushToSheet(esc) {
  const sid = sheetIdForZone(esc.zone);
  if (!sid) throw new Error(`No sheet for zone ${esc.zone}`);
  const sheets = getSheetsClient();
  // Idempotent: search by Issue ID in col A
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A:A' });
  const rows = res.data.values || [];
  const idx = rows.findIndex(r => r[0] === esc.issue_id);
  const row = escToRow(esc);
  if (idx >= 0) {
    await sheets.spreadsheets.values.update({ spreadsheetId: sid, range: `Active!A${idx+1}:AE${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [row] } });
    return { row: idx+1, action: 'updated' };
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: sid, range: 'Active!A:AE', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } });
    return { row: rows.length+1, action: 'appended' };
  }
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
  const wanted = new Set([...(fields || []), 'row_version', 'last_synced_at']);
  return COLS
    .map((field, idx) => ({ field, idx }))
    .filter(({ field }) => wanted.has(field))
    .map(({ field, idx }) => ({ field, col: colLetter(idx), value: row[idx] }));
}

// Write only the changed cells of an existing row, so a stale DB value cannot overwrite
// a hub edit in another column. Falls back to a full append if the Issue ID is not on the sheet yet.
export async function pushFields(esc, fields) {
  const sid = sheetIdForZone(esc.zone);
  if (!sid) throw new Error(`No sheet for zone ${esc.zone}`);
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A:A' });
  const rows = res.data.values || [];
  const idx = rows.findIndex(r => r[0] === esc.issue_id);
  if (idx < 0) return pushToSheet(esc);
  const rowNum = idx + 1;
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
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A1:AE5000' });
  return res.data.values || [];
}
