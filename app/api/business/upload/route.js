import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser, requireRole } from '../../../../lib/session';
import { readSheetTab } from '../../../../lib/sheets';
import {
  parseCsv, tableToRecords, normalizeRecords, planReplace, blockReason, sheetIdFromInput,
} from '../../../../lib/businessUpload';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TAB = 'Unique Merchants';
const SAMPLE = 40;

// Recent uploads for the admin history list.
export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from('business_upload_log')
    .select('id, uploaded_by, source, source_ref, status, rows_in_file, usable, duplicate_ids, no_kam, added, kam_changed, deactivated, error, created_at, finished_at')
    .order('created_at', { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ uploads: data || [] });
}

// Preview (default) or apply. Form fields:
//   mode: 'preview' | 'apply'
//   source: 'csv' | 'sheet'
//   file: CSV file (source=csv)
//   sheet: Google Sheets link or ID, tab (source=sheet, tab defaults to 'Unique Merchants')
//   confirm_large: 'true' to allow deactivating more than half of the active list
export async function POST(request) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const user = auth.user;
  const denied = requireRole(user, ['admin']); if (denied) return denied;

  let form;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'Send the upload as form data.' }, { status: 400 }); }
  const mode = form.get('mode') === 'apply' ? 'apply' : 'preview';
  const source = form.get('source') === 'sheet' ? 'sheet' : 'csv';
  const confirmLarge = form.get('confirm_large') === 'true';

  // 1) Read the source into rows.
  let sourceRef, table;
  try {
    if (source === 'csv') {
      const file = form.get('file');
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a CSV file.' }, { status: 400 });
      if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'The CSV is larger than 5 MB.' }, { status: 400 });
      sourceRef = file.name || 'upload.csv';
      table = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
    } else {
      const sid = sheetIdFromInput(form.get('sheet'));
      if (!sid) return NextResponse.json({ error: 'Paste a Google Sheets link or spreadsheet ID.' }, { status: 400 });
      const tab = String(form.get('tab') || DEFAULT_TAB).trim() || DEFAULT_TAB;
      sourceRef = `https://docs.google.com/spreadsheets/d/${sid}/edit · tab "${tab}"`;
      try { table = await readSheetTab(sid, tab); }
      catch (e) {
        return NextResponse.json({ error: `Google could not read that sheet or tab (${String(e.message || e).slice(0, 160)}). Check the link, the tab name, and that the connected Google account can open the sheet.` }, { status: 502 });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }

  // 2) Clean and plan against the current table.
  let norm, plan;
  try {
    const { records } = tableToRecords(table);
    norm = normalizeRecords(records);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
  const sb = supabaseAdmin();
  try {
    const current = await loadCurrent(sb);
    plan = planReplace(current, norm.rows);
  } catch (e) {
    return NextResponse.json({ error: `Could not read business_master: ${e.message}` }, { status: 500 });
  }
  const blocked = blockReason(plan, { confirmLarge });
  const summary = { source, source_ref: sourceRef, ...norm.stats, ...plan.counts };
  const sample = plan.changes.slice(0, SAMPLE);

  if (mode === 'preview' || blocked) {
    // can_override: only the "more than half deactivated" rule can be confirmed. Empty uploads cannot.
    const can_override = !!blocked && norm.stats.usable > 0;
    return NextResponse.json({ mode: 'preview', blocked, can_override, summary, sample, total_changes: plan.changes.length });
  }

  // 3) Apply: log the run, write merchants, then write the change log.
  const { data: log, error: logErr } = await sb.from('business_upload_log').insert({
    uploaded_by: user.email, source, source_ref: sourceRef, status: 'running',
    rows_in_file: norm.stats.rowsInFile, usable: norm.stats.usable,
    duplicate_ids: norm.stats.duplicateIds, no_kam: norm.stats.noKam,
  }).select('id').single();
  if (logErr) return NextResponse.json({ error: `Could not start the upload log: ${logErr.message}` }, { status: 500 });

  const now = new Date().toISOString();
  try {
    for (let i = 0; i < plan.upserts.length; i += 500) {
      const batch = plan.upserts.slice(i, i + 500).map((r) => ({ ...r, updated_at: now }));
      const { error } = await sb.from('business_master').upsert(batch, { onConflict: 'business_id' });
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < plan.changes.length; i += 1000) {
      const batch = plan.changes.slice(i, i + 1000).map((c) => ({ ...c, upload_id: log.id }));
      const { error } = await sb.from('business_master_changes').insert(batch);
      if (error) throw new Error(error.message);
    }
    await sb.from('business_upload_log').update({
      status: 'done', added: plan.counts.added, kam_changed: plan.counts.kamChanged,
      deactivated: plan.counts.deactivated, finished_at: new Date().toISOString(),
    }).eq('id', log.id);
  } catch (e) {
    await sb.from('business_upload_log').update({ status: 'failed', error: String(e.message || e).slice(0, 500), finished_at: new Date().toISOString() }).eq('id', log.id);
    return NextResponse.json({ error: `Upload stopped part-way: ${e.message}. The run is logged as failed (id ${log.id}). Run it again to finish.` }, { status: 500 });
  }
  return NextResponse.json({ mode: 'apply', upload_id: log.id, summary, sample, total_changes: plan.changes.length });
}

// business_master is read in pages, ordered by ID, so every row is seen.
async function loadCurrent(sb) {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from('business_master')
      .select('business_id, business_name, kam_name, is_active')
      .order('business_id').range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}
