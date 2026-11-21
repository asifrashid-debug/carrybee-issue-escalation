import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { mapLegacyRow } from '../../../../lib/legacyImport';
import { appendLegacyRows, withDerived } from '../../../../lib/sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const MAX_ROWS = 200;

// Called by the OLD sheet's Apps Script (OldSync.gs) with x-import-secret. Body: { dryRun, zoneTab, rows: [...] }.
// Insert-only: an issue already in the DB is never overwritten (hub edits win). Issues missing from the
// sheet (new, or a previous sheet write failed) are written to the Active tab through the shared writer.
export async function POST(req) {
  const secret = process.env.LEGACY_IMPORT_SECRET;
  if (!secret) return NextResponse.json({ error: 'LEGACY_IMPORT_SECRET not set' }, { status: 503 });
  if (req.headers.get('x-import-secret') !== secret) return NextResponse.json({ error: 'Bad secret' }, { status: 401 });

  const body = await req.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Max ${MAX_ROWS} rows per request` }, { status: 400 });
  const dryRun = body.dryRun === true;
  const sb = supabaseAdmin();

  const { data: hubs, error: hubErr } = await sb.from('hub_master').select('hub_name').limit(1000);
  if (hubErr) return NextResponse.json({ error: hubErr.message }, { status: 500 });
  const hubNames = new Set((hubs || []).map((h) => h.hub_name));

  const valid = [];
  const rejected = [];
  for (const r of rows) {
    const m = mapLegacyRow(r, hubNames, body.zoneTab);
    if (m.ok) valid.push(m.esc);
    else rejected.push({ issue_id: r.id || null, reasons: m.reasons });
  }
  const ids = valid.map((e) => e.issue_id);
  const { data: existing, error: exErr } = ids.length
    ? await sb.from('escalations').select('issue_id, sheet_row_number').in('issue_id', ids)
    : { data: [], error: null };
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  const have = new Map((existing || []).map((e) => [e.issue_id, e]));
  const fresh = valid.filter((e) => !have.has(e.issue_id));
  const missingFromSheet = [...have.values()].filter((e) => e.sheet_row_number == null).map((e) => e.issue_id);
  const alreadyInDb = valid.length - fresh.length;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true, received: rows.length, valid: valid.length, new: fresh.length,
      alreadyInDb, missingFromSheet: missingFromSheet.length, rejected,
    });
  }

  let inserted = 0;
  if (fresh.length) {
    const { error } = await sb.from('escalations').upsert(fresh, { onConflict: 'issue_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = fresh.length;
    await sb.from('audit_log').insert(fresh.map((e) => ({
      issue_id: e.issue_id, field_name: 'legacy_import', old_value: null,
      new_value: `Imported from OLD sheet (${e.zone})`, actor_email: 'legacy-import', source: 'system',
    })));
  }

  // Everything that needs a sheet row: new issues plus issues whose earlier sheet write did not happen.
  const toSheet = [...fresh.map((e) => e.issue_id), ...missingFromSheet];
  const failedSheet = [];
  let sheetWritten = 0;
  if (toSheet.length) {
    const { data: full, error: fullErr } = await sb.from('escalations').select('*').in('issue_id', toSheet);
    if (fullErr) return NextResponse.json({ error: fullErr.message }, { status: 500 });
    const derived = await Promise.all((full || []).map((e) => withDerived(e)));
    const byZone = new Map();
    for (const e of derived) {
      if (!byZone.has(e.zone)) byZone.set(e.zone, []);
      byZone.get(e.zone).push(e);
    }
    for (const [zone, escs] of byZone) {
      try {
        const placed = await appendLegacyRows(zone, escs);
        const now = new Date().toISOString();
        for (const p of placed) {
          await sb.from('escalations').update({ sheet_row_number: p.row, last_synced_at: now }).eq('issue_id', p.issue_id);
        }
        await sb.from('sync_log').insert(placed.map((p) => ({
          direction: 'db_to_sheet', issue_id: p.issue_id, status: 'success', payload: { legacy: true, row: p.row, action: p.action },
        })));
        sheetWritten += placed.length;
      } catch (err) {
        const msg = String(err.message || err).slice(0, 300);
        for (const e of escs) failedSheet.push(e.issue_id);
        await sb.from('sync_log').insert(escs.map((e) => ({
          direction: 'db_to_sheet', issue_id: e.issue_id, status: 'failed', error_message: `Legacy sheet write (${zone}): ${msg}`,
        })));
      }
    }
  }

  return NextResponse.json({
    received: rows.length, inserted, alreadyInDb, sheetWritten,
    failedSheet, rejected,
  });
}
