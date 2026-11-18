import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { pushFields } from '../../../../../lib/sheets';
import { isHubRole, HUB_BLOCKED_MESSAGE } from '../../../../../lib/hubPolicy';
import { requireUser } from '../../../../../lib/session';
import { cmPickBlock } from '../../../../../lib/pickSla';
import { loadScope, isVisible } from '../../../../../lib/visibility';
export const dynamic = 'force-dynamic';

// "CM picked" on a CM-assigned MX issue. Sets Business Pick timing only.
// The Ops "issue picked" column (issue_pick_time, ops_issue_status) is for the Ops end and is not changed here.
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const actor = session.email;
  if (isHubRole(session.role)) return NextResponse.json({ error: HUB_BLOCKED_MESSAGE }, { status: 403 });
  const { data: cur } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 }); // not visible to this viewer
  const blocked = cmPickBlock(session, cur);
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });
  const now = new Date().toISOString();
  // CM picks: an issue assigned to 'CM' (no KAM found) takes the picking CM member's name as its KAM.
  const takesKam = (cur.kam_name || '').trim().toUpperCase() === 'CM';
  const pickerName = (session.display_name || '').trim() || session.email;
  const patch = { business_pick_time: now, row_version: (cur.row_version||1)+1 };
  patch.pick_missed = new Date(now) > new Date(cur.pick_due_at); // late pick -> justification required
  if (takesKam) patch.kam_name = pickerName;
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert([
    { issue_id: params.id, field_name: 'business_pick_time', old_value: null, new_value: now, actor_email: actor, source: 'tracker' },
    ...(takesKam ? [{ issue_id: params.id, field_name: 'kam_name', old_value: cur.kam_name, new_value: pickerName, actor_email: actor, source: 'tracker' }] : [])
  ]);
  // Only the KAM name goes to the sheet. Business Pick timing is not a sheet column.
  if (takesKam) {
    try { await pushFields(data, ['kam_name']); await sb.from('sync_log').insert({ direction:'db_to_sheet', issue_id: params.id, status:'success' }); }
    catch(e){ await sb.from('sync_log').insert({ direction:'db_to_sheet', issue_id: params.id, status:'failed', error_message:String(e.message||e) }); }
  }
  return NextResponse.json({ data });
}
