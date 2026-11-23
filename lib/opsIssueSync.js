// Ops Issues sync and tracker writes. I/O only; the rules live in lib/opsIssues.mjs and lib/opsLifecycle.mjs.
//
// runOpsIssueSync (sync job, run by the cron route or an admin POST):
//   1. Reads business_master (paged). Builds the merchant -> KAM index.
//   2. For each zone sheet, reads 'Ops Issues'!A1:L (all headers). Stops that zone if the header row has changed.
//   3. Gives a system Issue ID to rows with a blank A cell (rpc next_issue_id), and fills I (KAM Name) on a Merchant Name match.
//   4. New rows start at Raised (sheet J). For existing rows the DB is the source for J (status) and K (validation):
//      a sheet cell that differs is rewritten from the DB.
//   5. Writes the sheet cells, then upserts into public.ops_issues (key issue_id).
// saveKamFeedback (tracker PATCH): writes column L on the sheet first, then ops_issues. Column B (Issue Raise Time) is never written by the app.
// applyIssueChange (tracker PATCH for pick, start, resolve, not resolved, validation): claims the change in the DB
//   first (guarded by the expected current status), then writes the sheet cells. If the sheet write fails, the DB change is rolled back.

import { supabaseAdmin } from './supabase';
import { sheetIdForZone, getSheetsClient } from './sheets';
import { OPS_SHEET, OPS_HEADERS, OPS_LAST_COL, L, buildKamIndex, parseOpsRow, planOpsRow, toDbRecord } from './opsIssues.mjs';
import { planSyncLifecycle } from './opsLifecycle.mjs';
import { opsNoticeRows } from './opsNotify.mjs';

export const OPS_ZONES = ['ISD', 'OSD', 'CTG'];
const PAGE = 1000;
const CHUNK = 200;

const range = (r) => `'${OPS_SHEET}'!${r}`;

export class OpsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Retries transient Google API errors (rate limit and 5xx) with a short backoff. Writes here are idempotent.
async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const code = Number(e?.code ?? e?.response?.status ?? 0);
      if (![429, 500, 502, 503, 504].includes(code)) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}

// PostgREST returns at most 1000 rows per request. buildQuery must return a fresh query each call.
export async function fetchAll(buildQuery) {
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

// Upserts records in chunks. PostgREST fills any column missing from a batch with null, so records are grouped by their column set first.
async function upsertGrouped(sb, records) {
  const groups = new Map();
  for (const r of records) {
    const key = Object.keys(r).sort().join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  let n = 0;
  for (const part of groups.values()) {
    for (let i = 0; i < part.length; i += CHUNK) {
      const chunk = part.slice(i, i + CHUNK);
      const { error } = await sb.from('ops_issues').upsert(chunk, { onConflict: 'issue_id' });
      if (error) throw new Error('DB upsert failed: ' + error.message);
      n += chunk.length;
    }
  }
  return n;
}

async function syncZone(zone, { sb, sheets, index, dryRun, users = [] }) {
  const sid = sheetIdForZone(zone);
  if (!sid) throw new Error('sheet id not set');

  const res = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid, range: range(`A1:${OPS_LAST_COL}`) }));
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

  // Issue IDs for blank rows. Duplicate IDs (same ID on two rows) are reported and not written.
  for (const p of plans) {
    if (p.plan.actions.needsId) p.issueId = dryRun ? `(new-${p.rowNumber})` : await newIssueId(sb);
  }
  const seen = new Set();
  const duplicateIds = [];
  for (const p of plans) {
    if (seen.has(p.issueId)) { duplicateIds.push(p.issueId); p.duplicate = true; }
    else seen.add(p.issueId);
  }

  // DB state for these IDs. Read in dry runs too (reads only), so the dry run reports what a real run would do.
  const ids = plans.filter((p) => !p.duplicate && !p.issueId.startsWith('(new')).map((p) => p.issueId);
  const existing = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data: rows, error } = await sb.from('ops_issues')
      .select('issue_id,kam_feedback,issue_status,validation,created_at').in('issue_id', part);
    if (error) throw new Error('DB read failed: ' + error.message);
    for (const r of rows || []) existing.set(r.issue_id, r);
  }

  const now = new Date();
  for (const p of plans) {
    if (p.duplicate) continue;
    const dbRow = existing.get(p.issueId) || null;
    p.dbRow = dbRow;
    p.life = planSyncLifecycle({ dbRow, sheet: { issue_status: p.o.issue_status, validation: p.o.validation }, now });
  }

  // Sheet write-back: IDs into A, KAM Name into its column (L.kam_name), and Issue Status / Validation where the DB value differs. Only the cells that change.
  const data = [];
  for (const p of plans) {
    if (p.duplicate) continue;
    if (dryRun) continue;
    if (p.plan.actions.needsId) data.push({ range: range(`A${p.rowNumber}`), values: [[p.issueId]] });
    if (p.plan.actions.kam_name) data.push({ range: range(`${L.kam_name}${p.rowNumber}`), values: [[p.plan.actions.kam_name]] });
    for (const [col, v] of Object.entries(p.life.sheetCells)) data.push({ range: range(`${col}${p.rowNumber}`), values: [[v]] });
  }
  if (!dryRun && data.length) {
    await withRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sid, requestBody: { valueInputOption: 'RAW', data } }));
  }

  const records = [];
  const newRecords = [];
  for (const p of plans) {
    if (p.duplicate) continue;
    const rec = toDbRecord(p.o, {
      issueId: p.issueId,
      kamName: p.plan.actions.kam_name || p.o.kam_name,
      dbFeedback: p.dbRow?.kam_feedback ?? null,
      sid,
      rowNumber: p.rowNumber,
    });
    if (p.life.isNew) {
      const fresh = { ...rec, validation: p.life.validation, ...p.life.insert };
      records.push(fresh);
      newRecords.push(fresh);
    } else {
      // Existing rows: status and validation stay as the DB has them. Backfill only for rows with no status yet.
      const { issue_status, validation, ...keep } = rec;
      records.push(p.life.backfill ? { ...keep, ...p.life.backfill } : keep);
    }
  }

  let upserted = 0;
  let notified = 0;
  let notifyError = null;
  if (!dryRun) {
    const stamp = new Date().toISOString();
    upserted = await upsertGrouped(sb, records.map((r) => ({ ...r, updated_at: stamp })));
    // Bell notice for each issue raised in this run (first sync that saw the row). Only after the DB write succeeded.
    // A failed notice write is reported, not thrown: the issue itself is already saved.
    try {
      const rows = opsNoticeRows(newRecords, users);
      if (rows.length) {
        const { error } = await sb.from('notifications').insert(rows);
        if (error) throw new Error(error.message);
      }
      notified = rows.length;
    } catch (e) {
      notifyError = e.message;
    }
  }

  const live = plans.filter((p) => !p.duplicate);
  return {
    rows: plans.length,
    idsAssigned: plans.filter((p) => p.plan.actions.needsId).length,
    raised: live.filter((p) => p.life.isNew).length,
    statusWriteBacks: live.filter((p) => p.life.sheetCells[L.issue_status]).length,
    validationWriteBacks: live.filter((p) => p.life.sheetCells[L.validation]).length,
    kamFilled: plans.filter((p) => p.plan.actions.kam_name).length,
    kamNotFound: plans.filter((p) => p.plan.kamStatus === 'not_found').length,
    kamAmbiguous: plans.filter((p) => p.plan.kamStatus === 'ambiguous').length,
    noMerchant: plans.filter((p) => p.plan.kamStatus === 'no_merchant').length,
    duplicateIds,
    upserted: dryRun ? 0 : upserted,
    wouldUpsert: records.length,
    notified,
    notifyError,
  };
}

// Sync job. dryRun reads everything and reports, with no writes to the sheet or the DB.
export async function runOpsIssueSync({ zones = OPS_ZONES, dryRun = false } = {}) {
  const sb = supabaseAdmin();
  const masters = await fetchAll(() => sb.from('business_master').select('business_name,kam_name,is_active').order('business_id'));
  const index = buildKamIndex(masters);
  const { data: users, error: uErr } = await sb.from('users_roles').select('email, role, display_name, kam_aliases, is_active').eq('is_active', true);
  if (uErr) throw new Error('DB read failed: ' + uErr.message);
  const sheets = getSheetsClient();
  const report = { dryRun, masterRows: masters.length, merchantKeys: index.size, zones: {}, errors: [] };
  for (const zone of zones) {
    try {
      report.zones[zone] = await syncZone(zone, { sb, sheets, index, dryRun, users: users || [] });
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

// Writes cells on one issue's row. cells: { [L.issue_status]: 'Picked', [L.validation]: 'Valid' }, column letter to value.
async function writeOpsCells(issue, cells) {
  if (!issue.sheet_spreadsheet_id) throw new OpsError(409, 'This issue is not linked to a sheet');
  const sheets = getSheetsClient();
  const row = await findSheetRow(sheets, issue.sheet_spreadsheet_id, issue.issue_id, issue.sheet_row_number);
  if (!row) throw new OpsError(502, 'Issue row not found on the sheet');
  const data = Object.entries(cells).map(([col, v]) => ({ range: range(`${col}${row}`), values: [[v ?? '']] }));
  await withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: issue.sheet_spreadsheet_id,
    requestBody: { valueInputOption: 'RAW', data },
  }));
  return row;
}

// DB first (guarded), then the sheet. On a sheet failure the DB change is rolled back, so the two stay in step.
// guard: { col, value } must still hold when the change is applied, else 409 (someone else changed the issue).
async function applyIssueChange(issue, { guard, patch, rollback, cells }) {
  const sb = supabaseAdmin();
  const stamp = new Date().toISOString();
  let q = sb.from('ops_issues').update({ ...patch, updated_at: stamp }).eq('issue_id', issue.issue_id);
  if (guard) q = q.eq(guard.col, guard.value);
  const { data, error } = await q.select('issue_id').maybeSingle();
  if (error) throw new OpsError(500, 'DB update failed: ' + error.message);
  if (!data) throw new OpsError(409, 'The issue changed. Reload the page and try again.');
  try {
    await writeOpsCells(issue, cells);
  } catch (e) {
    const undo = sb.from('ops_issues').update({ ...rollback, updated_at: new Date().toISOString() }).eq('issue_id', issue.issue_id);
    const { error: undoErr } = await undo;
    const tail = undoErr ? ' The DB could not be restored; the next sync will write the tracker value back to the sheet.' : '';
    throw new OpsError(502, 'Save failed. Nothing was changed.' + tail + (e?.message ? ` (${e.message})` : ''));
  }
}

// Lifecycle action (pick, start, resolve, not_resolved). plan comes from applyAction in lib/opsLifecycle.mjs.
export async function applyLifecycle(issue, plan) {
  const guard = plan.from ? { col: 'issue_status', value: plan.from } : null;
  await applyIssueChange(issue, { guard, patch: plan.patch, rollback: plan.rollback, cells: plan.cells });
  return plan.patch;
}

// Validation. plan comes from applyValidation in lib/opsLifecycle.mjs.
export async function applyValidationChange(issue, plan) {
  await applyIssueChange(issue, { guard: null, patch: plan.patch, rollback: plan.rollback, cells: plan.cells });
  return plan.patch;
}

// Saves KAM Feedback to the sheet (the KAM Feedback column, L.kam_feedback) and then to ops_issues. Throws on failure, with the DB unchanged.
export async function saveKamFeedback(issue, text) {
  if (!issue.sheet_spreadsheet_id) throw new Error('This issue is not linked to a sheet');
  const sheets = getSheetsClient();
  const row = await findSheetRow(sheets, issue.sheet_spreadsheet_id, issue.issue_id, issue.sheet_row_number);
  if (!row) throw new Error('Issue row not found on the sheet');
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: issue.sheet_spreadsheet_id,
    range: range(`${L.kam_feedback}${row}`),
    valueInputOption: 'RAW',
    requestBody: { values: [[text ?? '']] },
  }));
  const { error } = await supabaseAdmin().from('ops_issues')
    .update({ kam_feedback: text, sheet_row_number: row, updated_at: new Date().toISOString() })
    .eq('issue_id', issue.issue_id);
  if (error) throw new Error('DB update failed after the sheet was saved (the next sync will copy the sheet value): ' + error.message);
  return { row };
}

