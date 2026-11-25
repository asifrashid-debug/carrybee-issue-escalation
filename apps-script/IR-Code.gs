/**
 * CarryBee IR Issue Escalation: IR sheet -> tracker sync (Google Apps Script)
 *
 * Install in the IR sheet only (CarryBee IR Issue Escalation):
 *   Extensions > Apps Script > delete the default code > paste this file > Save.
 *
 * Then, once:
 *   1. Project Settings (gear icon) > Script properties > Add property
 *        Name:  WEBHOOK_SECRET
 *        Value: the same value as WEBHOOK_SECRET in Vercel (never paste it in chat or commit it)
 *   2. Run checkSetup() and check the log (View > Logs). It should list no missing headers.
 *   3. Run installEditTrigger() and approve the permissions prompt.
 *
 * Only the IR columns are sent (IR Status, Status From KAM, Assigned IR Member, Feedback from IR,
 * Feedback from IR Lead). Drive Link, the form columns and the SLA columns are written by the tracker.
 * Do NOT rename handleIrSheetEdit to onEdit (the trigger would fire twice).
 */

const IR_WEBHOOK_URL = 'https://carrybee-escalation-tracker.vercel.app/api/webhook/ir';
const IR_SHEET_NAME = 'Active';
const IR_HEADER_ROW = 1;
const IR_ISSUE_ID_COL = 1; // Column A: Issue ID
const IR_MAX_ATTEMPTS = 3;

// Header text in row 1 -> field name the webhook expects. Only these columns are sent.
const IR_FIELD_MAP = {
  'Status From KAM': 'ir_kam_status',
  'Assigned IR Member': 'ir_assigned_member',
  'Feedback from IR': 'ir_feedback',
  'Feedback from IR Lead': 'ir_lead_feedback',
  'IR Status': 'ir_status'
};

/** Installable edit trigger. Runs for user edits only (the tracker's own writes do not fire it). */
function handleIrSheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== IR_SHEET_NAME) return;
  const firstRow = e.range.getRow();
  const lastRow = e.range.getLastRow();
  const firstCol = e.range.getColumn();
  const lastCol = e.range.getLastColumn();
  if (lastRow <= IR_HEADER_ROW) return;

  const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret) {
    Logger.log('ERROR: WEBHOOK_SECRET is not set in Script properties. No edits were sent.');
    return;
  }
  const headers = sheet.getRange(IR_HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const editor = Session.getActiveUser().getEmail() || 'sheet';

  for (let row = Math.max(firstRow, IR_HEADER_ROW + 1); row <= lastRow; row++) {
    const issueId = String(sheet.getRange(row, IR_ISSUE_ID_COL).getValue() || '').trim();
    if (!issueId) continue;
    for (let col = firstCol; col <= lastCol; col++) {
      const header = String(headers[col - 1] || '').trim();
      const field = IR_FIELD_MAP[header];
      if (!field) continue;
      const value = sheet.getRange(row, col).getValue();
      sendIrEdit({
        issue_id: issueId,
        field: field,
        new_value: toIrPayloadValue(value),
        editor_email: editor,
        edit_time: new Date().toISOString(),
        secret: secret
      }, row, header);
    }
  }
}

function toIrPayloadValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v).trim();
}

/** POST one edit. Retries network errors and 5xx. Does not retry 4xx (cannot be fixed by retrying). */
function sendIrEdit(payload, row, header) {
  const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
  const label = `IR row ${row} [${header}] ${payload.issue_id}`;
  for (let attempt = 1; attempt <= IR_MAX_ATTEMPTS; attempt++) {
    try {
      const res = UrlFetchApp.fetch(IR_WEBHOOK_URL, options);
      const code = res.getResponseCode();
      let json = {};
      try { json = JSON.parse(res.getContentText() || '{}'); } catch (parseErr) { json = { error: 'non-JSON response' }; }
      if (code === 200 && json.ok !== false) return true;
      if (code >= 400 && code < 500) {
        Logger.log(`REJECTED ${label}: HTTP ${code} ${json.error || ''}`);
        return false;
      }
      Logger.log(`RETRY ${label}: HTTP ${code} (attempt ${attempt})`);
    } catch (err) {
      Logger.log(`RETRY ${label}: ${err} (attempt ${attempt})`);
    }
    Utilities.sleep(1000 * attempt);
  }
  Logger.log(`FAILED ${label} after ${IR_MAX_ATTEMPTS} attempts`);
  return false;
}

/** Run once after saving the script property. Logs what is missing. */
function checkSetup() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(IR_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${IR_SHEET_NAME}" not found`);
  const headers = sheet.getRange(IR_HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const missingHeaders = Object.keys(IR_FIELD_MAP).filter(h => !headers.includes(h));
  const hasSecret = !!PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  const hasTrigger = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'handleIrSheetEdit');
  Logger.log(JSON.stringify({ missingHeaders, hasSecret, hasTrigger }, null, 2));
  if (missingHeaders.length) Logger.log('Fix the header names listed above before syncing.');
  if (!hasSecret) Logger.log('Add WEBHOOK_SECRET under Project Settings > Script properties.');
}

/** Run once. Creates the installable edit trigger if it does not exist. */
function installEditTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'handleIrSheetEdit');
  if (exists) { Logger.log('Edit trigger already installed. Nothing to do.'); return; }
  ScriptApp.newTrigger('handleIrSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  Logger.log('Edit trigger installed.');
}

/** Removes the trigger, for example before a rollback. */
function removeEditTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'handleIrSheetEdit').forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Edit trigger removed (if it existed).');
}
