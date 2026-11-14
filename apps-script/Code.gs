/**
 * CarryBee Hub Sheet — on-edit trigger (install per hub sheet)
 * Posts changed Ops-block cells to API webhook. Target ≤60s.
 * Setup: Extensions > Apps Script > paste this > Deploy as Web App OR install onEdit trigger.
 * Set WEBHOOK_URL + WEBHOOK_SECRET (same as Vercel env).
 */
const WEBHOOK_URL = 'https://YOUR-VERCEL-URL/api/webhook/sheet'; // TODO: set after deploy
const WEBHOOK_SECRET = 'change-me'; // TODO: match env

function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'Active') return;
  const range = e.range;
  const row = range.getRow();
  if (row <= 1) return; // header
  const issueId = sheet.getRange(row, 1).getValue(); // A
  if (!issueId) return;
  const col = range.getColumn(); // 1-based
  const headers = sheet.getRange(1, 1, 1, 29).getValues()[0];
  const fieldHeader = headers[col-1];
  const FIELD_MAP = {
    'Comments 1 (Ops End)': 'comments_1',
    'Comments 2 (Ops End)': 'comments_2',
    'Issue Pick Time': 'issue_pick_time',
    'ISSUE STATUS': 'ops_issue_status',
    'Remarks': 'remarks',
    'Regional Lead': 'regional_lead',
    'Division': 'division',
    'Ops Status': 'ops_status',
    'Validation': 'validation',
    'Issue Category (Ops Type)': 'ops_category'
  };
  const field = FIELD_MAP[fieldHeader];
  if (!field) return; // Requester block / protected — ignore (DB wins)
  const newValue = range.getValue();
  const editor = Session.getActiveUser().getEmail();
  const payload = { issue_id: String(issueId), field, new_value: newValue ? String(newValue) : '', editor_email: editor, edit_time: new Date().toISOString(), secret: WEBHOOK_SECRET };
  UrlFetchApp.fetch(WEBHOOK_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
}
