/**
 * CarryBee Issue Escalation Tracker — hub sheet → tracker sync (Google Apps Script)
 *
 * Install in EACH zone sheet (ISD, OSD, CTG):
 *   Extensions > Apps Script > delete the default code > paste this file > Save.
 *
 * Then, once per sheet:
 *   1. Project Settings (gear icon) > Script properties > Add property
 *        Name:  WEBHOOK_SECRET
 *        Value: the same value as WEBHOOK_SECRET in Vercel (never paste it in chat or commit it)
 *   2. Run checkSetup() and check the log (View > Logs) — it should list no missing headers.
 *   3. Run installEditTrigger() and approve the permissions prompt.
 *
 * Do NOT rename handleSheetEdit to onEdit: a simple onEdit plus the installable trigger
 * would fire twice for every edit.
 */

const WEBHOOK_URL = 'https://carrybee-escalation-tracker.vercel.app/api/webhook/sheet';
const SHEET_NAME = 'Active';
const HEADER_ROW = 1;
const ISSUE_ID_COL = 1; // Column A: Issue ID (DB-owned)
const MAX_ATTEMPTS = 3;
const RESPONSE_HEADER = 'Issue Response Date & Time'; // Column X
const OPS_STATUS_HEADER = 'Ops Status';               // Column Z
const COMPLETED_HEADER = 'Completed At';              // Column AE
const LAYER_HEADERS = [
  'Layer 1 Response (HUB Incharge)',
  'Layer 2 Response (Cluster Lead)',
  'Layer 3 Response (Regional Lead)'
];

// Header text in row 1  ->  field name the webhook expects.
// Only these columns are sent back to the tracker. Everything else is ignored.
const FIELD_MAP = {
  'Layer 1 Response (HUB Incharge)': 'layer1_response',
  'Layer 2 Response (Cluster Lead)': 'layer2_response',
  'Layer 3 Response (Regional Lead)': 'layer3_response',
  'Issue Pick Time': 'issue_pick_time',
  'ISSUE STATUS': 'ops_issue_status',
  'Remarks': 'remarks',
  'Regional Lead': 'regional_lead',
  'Division': 'division',
  'Ops Status': 'ops_status',
  'Validation': 'validation',
  'Issue Category (Ops Type)': 'ops_category'
};

/**
 * Installable edit trigger. Runs for user edits only.
 * Edits made by the tracker's own API (service account) do not fire this, so there is no echo loop.
 */
function handleSheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const firstRow = e.range.getRow();
  const lastRow = e.range.getLastRow();
  const firstCol = e.range.getColumn();
  const lastCol = e.range.getLastColumn();
  if (lastRow <= HEADER_ROW) return; // ignore header edits

  const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret) {
    Logger.log('ERROR: WEBHOOK_SECRET is not set in Script properties. No edits were sent.');
    return;
  }

  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const editor = Session.getActiveUser().getEmail() || 'sheet';

  for (let row = Math.max(firstRow, HEADER_ROW + 1); row <= lastRow; row++) {
    const issueId = String(sheet.getRange(row, ISSUE_ID_COL).getValue() || '').trim();
    if (!issueId) continue; // no Issue ID yet, nothing to sync

    for (let col = firstCol; col <= lastCol; col++) {
      const header = String(headers[col - 1] || '').trim();
      const field = FIELD_MAP[header];
      if (!field) continue;

      const value = sheet.getRange(row, col).getValue();
      if (LAYER_HEADERS.includes(header) && String(value).trim() !== '') {
        stampResponseTime(sheet, row, headers);
      }
      if (header === OPS_STATUS_HEADER) {
        stampCompletedAt(sheet, row, headers, value);
      }
      sendEdit({
        issue_id: issueId,
        field: field,
        new_value: toPayloadValue(value),
        editor_email: editor,
        edit_time: new Date().toISOString(),
        secret: secret
      }, sheet.getName(), row, header);
    }
  }
}

/**
 * Writes the current time into Issue Response Date & Time (column X) on the edited row,
 * the first time any layer response is entered. Keeps an existing value.
 * Runs in the sheet itself, so it works even if the webhook is down.
 * The webhook also stamps the database on the same first comment.
 */
function stampResponseTime(sheet, row, headers) {
  const col = headers.map(h => String(h).trim()).indexOf(RESPONSE_HEADER) + 1;
  if (col < 1) {
    Logger.log(`ERROR: column "${RESPONSE_HEADER}" not found in row 1`);
    return;
  }
  const cell = sheet.getRange(row, col);
  if (String(cell.getValue()).trim() !== '') return; // keep the first response time
  cell.setValue(new Date()).setNumberFormat('dd-mmm-yyyy hh:mm AM/PM');
}

/**
 * Writes the current time into Completed At (column AE) when Ops Status becomes Completed.
 * Keeps the first completion time. Clears it when the status changes away from Completed,
 * the same rule the database uses. Runs in the sheet itself, so it does not depend on the webhook.
 */
function stampCompletedAt(sheet, row, headers, status) {
  const col = headers.map(h => String(h).trim()).indexOf(COMPLETED_HEADER) + 1;
  if (col < 1) {
    Logger.log(`ERROR: column "${COMPLETED_HEADER}" not found in row 1`);
    return;
  }
  const cell = sheet.getRange(row, col);
  if (String(status).trim() === 'Completed') {
    if (String(cell.getValue()).trim() !== '') return; // keep the first completion time
    cell.setValue(new Date()).setNumberFormat('dd-mmm-yyyy hh:mm AM/PM');
  } else {
    cell.clearContent();
  }
}

/** Convert a cell value into a string the webhook can read. Dates become ISO strings. */
function toPayloadValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v).trim();
}

/**
 * POST one edit to the webhook.
 * Retries network errors and 5xx responses. Does not retry 4xx or business rejections
 * (for example "Protected field" or "Pick time already set"), because retrying cannot fix them.
 */
function sendEdit(payload, sheetName, row, header) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  const label = `${sheetName} row ${row} [${header}] ${payload.issue_id}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = UrlFetchApp.fetch(WEBHOOK_URL, options);
      const code = res.getResponseCode();
      const text = res.getContentText() || '{}';
      let json = {};
      try { json = JSON.parse(text); } catch (parseErr) { json = { error: text.slice(0, 200) }; }

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
  Logger.log(`FAILED ${label} after ${MAX_ATTEMPTS} attempts`);
  return false;
}

/** Run once per sheet after saving the script property. Logs what is missing. */
function checkSetup() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());
  const missingHeaders = Object.keys(FIELD_MAP).filter(h => !headers.includes(h));
  const hasSecret = !!PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  const hasTrigger = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'handleSheetEdit');

  Logger.log(JSON.stringify({ missingHeaders, hasSecret, hasTrigger }, null, 2));
  if (missingHeaders.length) Logger.log('Fix the header names listed above before syncing.');
  if (!hasSecret) Logger.log('Add WEBHOOK_SECRET under Project Settings > Script properties.');
}

/** Run once per sheet. Creates the installable edit trigger if it does not already exist. */
function installEditTrigger() {
  const exists = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'handleSheetEdit');
  if (exists) {
    Logger.log('Edit trigger already installed. Nothing to do.');
    return;
  }
  ScriptApp.newTrigger('handleSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  Logger.log('Edit trigger installed.');
}

/** Run once per sheet to remove the trigger, for example before a rollback. */
function removeEditTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'handleSheetEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Edit trigger removed (if it existed).');
}

/**
 * OPTIONAL diagnostic. Run it from the Apps Script editor to check that this sheet's
 * WEBHOOK_SECRET matches Vercel. It sends a fake issue ID, so nothing is written.
 *   404 Issue not found -> the secret matches.
 *   401 Bad secret      -> the secret does not match. Re-enter it under Script properties.
 * You can delete this function after the check.
 */
function testWebhookSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  const res = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ issue_id: 'CB-PROBE-0000', field: 'layer1_response', new_value: 'probe', secret: secret })
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
