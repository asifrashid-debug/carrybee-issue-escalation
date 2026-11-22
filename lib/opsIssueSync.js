// Ops Issues sync and KAM Feedback writes. I/O only; the rules live in lib/opsIssues.mjs.
//
// runOpsIssueSync (sync job, run by the cron route or an admin POST):
//   1. Reads business_master (paged). Builds the merchant -> KAM index.
//   2. For each zone sheet, reads 'Ops Issues'!A1:J. Stops that zone if the header row has changed.
//   3. Gives a system Issue ID to rows with a blank A cell (rpc next_issue_id), and fills G (KAM Name) on a Merchant Name match.
//   4. Writes those cells back to the sheet, then upserts every row into public.ops_issues (key issue_id).
// saveKamFeedback (tracker PATCH): writes column J on the sheet first, then ops_issues. A failed sheet write leaves the DB unchanged.

import { supabaseAdmin } from './supabase';
import { sheetIdForZone, getSheetsClient, withRetry } from './sheets';
import { OPS_SHEET, OPS_HEADERS, buildKamIndex, parseOpsRow, planOpsRow, toDbRecord } from './opsIssues.mjs';

export const OPS_ZONES = ['ISD', 'OSD', 'CTG'];
const PAGE = 1000;
const CHUNK = 200;

const range = (r) => `'${OPS_SHEET}'!${r}`;

// PostgREST returns at most 1000 rows per request. buildQuery must return a fresh query each call.
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw new Error('DB read failed: ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function newIssueId(sb) {
  const { data, error } = await sb.rpc('next_issue_id');
  if (error || !data) throw new Error('could not create Issue ID: ' + (error?.message || 'empty result'));
  return data;
}

async function syncZone(zone, { sb, sheets, index, dryRun }) {
  const sid = sheetIdForZone(zone);
  if (!sid) throw new Error('sheet id not set');

  const res = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid, range: range('A1:J') }));
  const values = res.data.values || [];
  const head = (values[0] || []).slice(0, OPS_HEADERS.length).map((c) => String(c ?? '').trim());
  if (OPS_HEADERS.some((h, i) => head[i] !== h)) throw new Error('header row does not match the Ops Issues layout; zone skipped');

  const plans = [];
  for (let i = 1; i < values.length; i++) {
    const rowNumber = i + 1;
    const o = parseOpsRow(values[i]);
    const plan = planOpsRow(o, index);
    if (!plan.skip) plans.push({ rowNumber, o, plan, issueId: o.issue_id });
  }

  // Issue IDs for blank rows. Duplicate IDs (same ID on two rows) are reported and not written to the DB.
  for (const p of plans) {
    if (p.plan.actions.needsId) p.issueId = dryRun ? `(new-${p.rowNumber})` : await newIssueId(sb);
  }
  const seen = new Set();
  const duplicateIds = [];
  for (const p of plans) {
    if (seen.has(p.issueId)) { duplicateIds.push(p.issueId); p.duplicate = true; }
    else seen.add(p.issueId);
  }

  // Sheet write-back: IDs into column A, KAM Name into column G. Only the cells that changed.
  const data = [];
  for (const p of plans) {
    if (p.plan.actions.needsId && !dryRun) data.push({ range: range(`A${p.rowNumber}`), values: [[p.issueId]] });
    if (p.plan.actions.kam_name && !dryRun) data.push({ range: range(`G${p.rowNumber}`), values: [[p.plan.actions.kam_name]] });
  }
  if (!dryRun && data.length) {
    await withRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sid, requestBody: { valueInputOption: 'RAW', data } }));
  }

  // Existing KAM Feedback in the DB, so a blank sheet cell does not erase it.
  const ids = plans.filter((p) => !p.duplicate && !p.issueId.startsWith('(new')).map((p) => p.issueId);
  const existing = new Map();
  if (!dryRun) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      const { data: rows, error } = await sb.from('ops_issues').select('issue_id,kam_feedback').in('issue_id', part);
      if (error) throw new Error('DB read failed: ' + error.message);
      for (const r of rows || []) existing.set(r.issue_id, r.kam_feedback);
    }
  }

  const records = plans.filter((p) => !p.duplicate).map((p) => toDbRecord(p.o, {
    issueId: p.issueId,
    kamName: p.plan.actions.kam_name || p.o.kam_name,
    dbFeedback: existing.get(p.issueId) ?? null,
    sid,
    rowNumber: p.rowNumber,
  }));

  let upserted = 0;
  if (!dryRun) {
    const now = new Date().toISOString();
    for (let i = 0; i < records.length; i += CHUNK) {
      const part = records.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
      const { error } = await sb.from('ops_issues').upsert(part, { onConflict: 'issue_id' });
      if (error) throw new Error('DB upsert failed: ' + error.message);
      upserted += part.length;
    }
  }

  return {
    rows: plans.length,
    idsAssigned: plans.filter((p) => p.plan.actions.needsId).length,
    kamFilled: plans.filter((p) => p.plan.actions.kam_name).length,
    kamNotFound: plans.filter((p) => p.plan.kamStatus === 'not_found').length,
    kamAmbiguous: plans.filter((p) => p.plan.kamStatus === 'ambiguous').length,
    noMerchant: plans.filter((p) => p.plan.kamStatus === 'no_merchant').length,
    duplicateIds,
    upserted: dryRun ? 0 : upserted,
    wouldUpsert: records.length,
  };
}

// Sync job. dryRun reads everything and reports, with no writes to the sheet or the DB.
export async function runOpsIssueSync({ zones = OPS_ZONES, dryRun = false } = {}) {
  const sb = supabaseAdmin();
  const masters = await fetchAll(() => sb.from('business_master').select('business_name,kam_name,is_active').order('business_id'));
  const index = buildKamIndex(masters);
  const sheets = getSheetsClient();
  const report = { dryRun, masterRows: masters.length, merchantKeys: index.size, zones: {}, errors: [] };
  for (const zone of zones) {
    try {
      report.zones[zone] = await syncZone(zone, { sb, sheets, index, dryRun });
    } catch (e) {
      report.errors.push(`${zone}: ${e.message}`);
    }
  }
  return report;
}

// Finds the sheet row for an issue. Uses the stored row number when it still holds this ID, else searches column A.
async function findSheetRow(sheets, sid, issueId, hint) {
  if (hint) {
    const probe = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid, range: range(`A${hint}`) }));
    if (String(probe.data.values?.[0]?.[0] ?? '').trim() === issueId) return hint;
  }
  const col = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid, range: range('A2:A') }));
  const idx = (col.data.values || []).findIndex((r) => String(r?.[0] ?? '').trim() === issueId);
  return idx === -1 ? null : idx + 2;
}

// Saves KAM Feedback to the sheet (column J) and then to ops_issues. Throws on failure, with the DB unchanged.
export async function saveKamFeedback(issue, text) {
  if (!issue.sheet_spreadsheet_id) throw new Error('This issue is not linked to a sheet');
  const sheets = getSheetsClient();
  const row = await findSheetRow(sheets, issue.sheet_spreadsheet_id, issue.issue_id, issue.sheet_row_number);
  if (!row) throw new Error('Issue row not found on the sheet');
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: issue.sheet_spreadsheet_id,
    range: range(`J${row}`),
    valueInputOption: 'RAW',
    requestBody: { values: [[text ?? '']] },
  }));
  const { error } = await supabaseAdmin().from('ops_issues')
    .update({ kam_feedback: text, sheet_row_number: row, updated_at: new Date().toISOString() })
    .eq('issue_id', issue.issue_id);
  if (error) throw new Error('DB update failed after the sheet was saved (the next sync will copy the sheet value): ' + error.message);
  return { row };
}

export { fetchAll };
