import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { LEGACY_ID_RE, planLayerFill } from '../../../../../lib/legacyImport';
import { fillLayerCells } from '../../../../../lib/sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const MAX_ROWS = 200;

// One-time backfill of Layer 1 (OLD Comments 1) and Layer 2 (OLD Comments 2) for OLD- issues already in the hub.
// Body: { dryRun, rows: [{ id, layer1, layer2 }] }. Fill-only: a layer is written only where the hub has no value.
// Each DB update is guarded (is null), and the sheet cell is written only if it is blank and the row still
// holds the same Issue ID. Every value written gets an audit_log row.
export async function POST(req) {
  const secret = process.env.LEGACY_IMPORT_SECRET;
  if (!secret) return NextResponse.json({ error: 'LEGACY_IMPORT_SECRET not set' }, { status: 503 });
  if (req.headers.get('x-import-secret') !== secret) return NextResponse.json({ error: 'Bad secret' }, { status: 401 });

  const body = await req.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Max ${MAX_ROWS} rows per request` }, { status: 400 });
  const dryRun = body.dryRun === true;
  const sb = supabaseAdmin();

  const ids = rows.map((r) => String(r.id || '').trim()).filter((id) => LEGACY_ID_RE.test(id));
  const { data: dbRows, error } = ids.length
    ? await sb.from('escalations').select('issue_id, zone, layer1_response, layer2_response, sheet_row_number').in('issue_id', ids)
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const byId = new Map((dbRows || []).map((r) => [r.issue_id, r]));

  const rejected = [];
  const notInDb = [];
  const plan = [];
  let nothingToFill = 0;
  for (const r of rows) {
    const id = String(r.id || '').trim();
    if (!LEGACY_ID_RE.test(id)) { rejected.push({ issue_id: id || null, reasons: ['bad id'] }); continue; }
    const db = byId.get(id);
    if (!db) { notInDb.push(id); continue; }
    const fill = planLayerFill(db, { layer1: r.layer1, layer2: r.layer2 });
    if (!Object.keys(fill).length) { nothingToFill++; continue; }
    plan.push({ id, zone: db.zone, row: db.sheet_row_number, fill });
  }
  const counts = {
    received: rows.length,
    toFill: plan.length,
    layer1Fills: plan.filter((p) => p.fill.layer1_response).length,
    layer2Fills: plan.filter((p) => p.fill.layer2_response).length,
    notOnSheet: plan.filter((p) => p.row == null).length,
    nothingToFill,
    notInDb: notInDb.length,
    rejected,
  };
  if (dryRun) return NextResponse.json({ dryRun: true, ...counts });

  // Sheet first, then the database, so a sheet failure never leaves the DB ahead of the sheet.
  const failedSheet = [];
  const sheetOk = new Set();
  const byZone = new Map();
  for (const p of plan) {
    if (p.row == null) continue;
    if (!byZone.has(p.zone)) byZone.set(p.zone, []);
    byZone.get(p.zone).push({ id: p.id, row: p.row, layer1: p.fill.layer1_response, layer2: p.fill.layer2_response });
  }
  const sheetReport = { written: 0, skipped: 0, mismatch: [] };
  for (const [zone, items] of byZone) {
    try {
      const res = await fillLayerCells(zone, items);
      sheetReport.written += res.written.length;
      sheetReport.skipped += res.skipped.length;
      sheetReport.mismatch.push(...res.mismatch);
      for (const it of items) if (!res.mismatch.includes(it.id)) sheetOk.add(it.id);
    } catch (err) {
      const msg = String(err.message || err).slice(0, 300);
      for (const it of items) failedSheet.push(it.id);
      await sb.from('sync_log').insert(items.map((it) => ({
        direction: 'db_to_sheet', issue_id: it.id, status: 'failed', error_message: `Legacy layer backfill (${zone}): ${msg}`,
      })));
    }
  }

  // Database: only rows whose sheet cell is in step (written, or already matching). Rows not on the sheet are skipped.
  let dbUpdated = 0;
  const dbFailed = [];
  for (const p of plan) {
    if (p.row == null || !sheetOk.has(p.id)) continue;
    let q = sb.from('escalations').update(p.fill).eq('issue_id', p.id);
    if (p.fill.layer1_response !== undefined) q = q.is('layer1_response', null);
    if (p.fill.layer2_response !== undefined) q = q.is('layer2_response', null);
    const { error: upErr } = await q;
    if (upErr) { dbFailed.push(p.id); continue; }
    dbUpdated++;
    const audit = Object.entries(p.fill).map(([field, value]) => ({
      issue_id: p.id, field_name: field, old_value: null, new_value: value,
      actor_email: 'legacy-import', source: 'system',
    }));
    await sb.from('audit_log').insert(audit);
  }

  return NextResponse.json({
    ...counts, dbUpdated, sheetWritten: sheetReport.written, sheetSkipped: sheetReport.skipped,
    sheetMismatch: sheetReport.mismatch, failedSheet, dbFailed,
  });
}
