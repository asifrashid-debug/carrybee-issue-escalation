import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { pushToSheet, readSheetOps, withDerived } from '../../../../lib/sheets';
import { requireUser, requireRole } from '../../../../lib/session';
export const dynamic = 'force-dynamic';
// Reconciliation: compare sheet Ops block with DB; repair drift by field ownership; re-append missing rows.
export async function POST(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const denied = requireRole(session, ['admin']); if (denied) return denied;
  const sb = supabaseAdmin();
  const body = await req.json().catch(()=>({}));
  const zone = body.zone;
  const sidMap = { ISD: process.env.SHEET_ISD, OSD: process.env.SHEET_OSD, CTG: process.env.SHEET_CTG };
  const sid = sidMap[zone];
  if (!sid) return NextResponse.json({ error: 'zone ISD/OSD/CTG required' }, { status: 400 });
  let sheetRows = [];
  try { sheetRows = await readSheetOps(sid); } catch(e){ return NextResponse.json({ error: 'Sheet read failed: '+e.message }, { status: 500 }); }
  const { data: dbRows } = await sb.from('escalations').select('*').eq('zone', zone).eq('is_archived', false);
  const sheetById = new Map();
  for (let i=1;i<sheetRows.length;i++) { const r = sheetRows[i]; if (r[0]) sheetById.set(r[0], { rowNum: i+1, vals: r }); }
  let repaired = 0, reappended = 0, checked = 0, derivedFixed = 0;
  for (const e of (dbRows||[])) {
    checked++;
    const s = sheetById.get(e.issue_id);
    if (!s) { try { await pushToSheet(e); reappended++; } catch {} continue; }
    // Compare Ops block (cols Q-AA indices 16-26) — if drift, DB wins for requester, last-write for ops (here: push DB to sheet)
    // Simplified: re-push if row_version mismatch
    const sheetVer = parseInt(s.vals[28]||'0'); // AC Row Version (COLS index 28)
    // Also repair when the derived AF-AH cells (Issue Pick, Issue Resolution, Overall Validation) differ from
    // what the DB gives now. Ops edits in the sheet update the DB without re-pushing these cells.
    const derived = (await withDerived(e))._derived;
    const sheetDerived = [31, 32, 33].map((i) => String(s.vals[i] ?? '').trim());
    const derivedDrift = derived.some((v, i) => v !== sheetDerived[i]);
    if (sheetVer !== e.row_version || derivedDrift) {
      if (derivedDrift && sheetVer === e.row_version) derivedFixed++;
      try { await pushToSheet(e); repaired++; } catch {}
    }
  }
  await sb.from('sync_log').insert({ direction:'reconciliation', status:'success', payload:{ zone, checked, repaired, reappended, derivedFixed } });
  return NextResponse.json({ ok: true, zone, checked, repaired, reappended, derivedFixed });
}
