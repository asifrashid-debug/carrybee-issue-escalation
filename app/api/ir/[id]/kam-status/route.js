import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { loadScope, isVisible } from '../../../../../lib/visibility';
import { pushIrRow } from '../../../../../lib/irSheet';
import { canSetIrKamStatus, kamStatusError } from '../../../../../lib/irKamStatus.mjs';

export const dynamic = 'force-dynamic';

// PATCH /api/ir/{issue_id}/kam-status  body: { status }
// Sets Status From KAM for an IR issue, writes the audit entry and refreshes the IR sheet row.
export async function PATCH(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response;
  const session = auth.user;
  const sb = supabaseAdmin();
  const id = params.id;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Send the status as JSON.' }, { status: 400 }); }
  const status = String(body?.status ?? '').trim();
  const bad = kamStatusError(status);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const { data: cur, error: e1 } = await sb.from('escalations').select('*').eq('issue_id', id).single();
  if (e1 || !cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!cur.route_ir) return NextResponse.json({ error: 'This issue is not routed to IR.' }, { status: 400 });

  const { data: users } = await sb.from('users_roles').select('email, role, teams').eq('is_active', true);
  if (!canSetIrKamStatus(session, cur, users || [])) {
    return NextResponse.json({ error: 'Only the KAM who raised this issue, their team lead or an admin can set the KAM Status.' }, { status: 403 });
  }
  if ((cur.ir_kam_status || '') === status) return NextResponse.json({ ok: true, unchanged: true, data: cur });

  const patch = { ir_kam_status: status, row_version: (cur.row_version || 1) + 1 };
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert({ issue_id: id, field_name: 'ir_kam_status', old_value: cur.ir_kam_status ? String(cur.ir_kam_status) : null, new_value: status, actor_email: session.email, source: 'tracker' });
  // Refresh the IR row so the sheet's Status From KAM matches. A failure is logged, the saved value stays.
  try { await pushIrRow(data); } catch (err) {
    await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: id, status: 'failed', error_message: `IR row refresh failed: ${String(err.message || err).slice(0, 250)}` });
  }
  return NextResponse.json({ ok: true, data });
}
