import { google } from 'googleapis';

// Sheet layout A-AC (29 cols) — see README mapping
export const COLS = ['issue_id','submitted_at','email','consignment_id','merchant_name','channel','zone','concern_hub','issue_status','issue_category','issue_sub_category','issue_details','kam_name','week','priority_scale','kam_feedback_status','comments_1','comments_2','issue_pick_time','ops_issue_status','remarks','regional_lead','division','issue_response_datetime','ops_status','validation','ops_category','row_version','last_synced_at'];
export const HEADERS = ['Issue ID','Timestamp','Email Address','Consignment ID','Merchant Name','Channel','Zone','Concern Hub','Issue Status','Issue Category','Issue Sub Category','Issue Details','KAM Name','Week','Priority Scale','KAM Feedback Status','Comments 1 (Ops End)','Comments 2 (Ops End)','Issue Pick Time','ISSUE STATUS','Remarks','Regional Lead','Division','Issue Response Date & Time','Ops Status','Validation','Issue Category (Ops Type)','Row Version','Last Synced At'];

function sheetIdForZone(zone) {
  const map = { ISD: process.env.SHEET_ISD, OSD: process.env.SHEET_OSD, CTG: process.env.SHEET_CTG };
  return map[zone];
}
function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set — sheet sync queued');
  const creds = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
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
  return [e.issue_id, fmtDhaka(e.submitted_at), e.email, e.consignment_id||'', e.merchant_name||'', e.channel, e.zone, e.concern_hub, e.issue_status, e.issue_category, e.issue_sub_category, e.issue_details, e.kam_name||'', e.week, e.priority_scale, e.kam_feedback_status, e.comments_1||'', e.comments_2||'', fmtDhaka(e.issue_pick_time), e.ops_issue_status, e.remarks||'', e.regional_lead||'', e.division||'', fmtDhaka(e.issue_response_datetime), e.ops_status, e.validation||'', e.ops_category||'', String(e.row_version||1), fmtDhaka(e.last_synced_at||new Date().toISOString())];
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
    await sheets.spreadsheets.values.update({ spreadsheetId: sid, range: `Active!A${idx+1}:AC${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [row] } });
    return { row: idx+1, action: 'updated' };
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: sid, range: 'Active!A:AC', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } });
    return { row: rows.length+1, action: 'appended' };
  }
}
export async function readSheetOps(sid) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Active!A1:AC5000' });
  return res.data.values || [];
}
