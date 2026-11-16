import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { pushFields } from '../../../../../lib/sheets';
import { isHubRole, HUB_BLOCKED_MESSAGE } from '../../../../../lib/hubPolicy';
import { requireUser } from '../../../../../lib/session';
import { pickBlock } from '../../../../../lib/pickSla';
import { loadScope, isVisible } from '../../../../../lib/visibility';
export const dynamic = 'force-dynamic';
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const actor = session.email;
  if (isHubRole(session.role)) return NextResponse.json({ error: HUB_BLOCKED_MESSAGE }, { status: 403 });
  const { data: cur } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 }); // not visible to this viewer
  if (cur.issue_pick_time) return NextResponse.json({ error: 'Already picked. Pick Time is set-once and immutable.' }, { status: 400 });
  const blocked = pickBlock(session, cur);
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });
  const now = new Date().toISOString();
  // CM picks: an issue assigned to 'CM' (no KAM found) takes the picking CM member's name as its KAM.
  const CM_PICKERS = ['cm_member', 'cm_lead'];
  const takesKam = CM_PICKERS.includes(session.role) && (cur.kam_name || '').trim().toUpperCase() === 'CM';
  const pickerName = (session.display_name || '').trim() || session.email;
  const patch = { issue_pick_time: now, ops_issue_status: 'Picked', row_version: (cur.row_version||1)+1 };
  if (cur.cm_assigned) patch.pick_missed = new Date(now) > new Date(cur.pick_due_at); // late pick -> justification required
  if (takesKam) patch.kam_name = pickerName;
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert([
    { issue_id: params.id, field_name: 'issue_pick_time', old_value: null, new_value: now, actor_email: actor, source: 'tracker' },
    { issue_id: params.id, field_name: 'ops_issue_status', old_value: cur.ops_issue_status, new_value: 'Picked', actor_email: actor, source: 'tracker' },
    ...(takesKam ? [{ issue_id: params.id, field_name: 'kam_name', old_value: cur.kam_name, new_value: pickerName, actor_email: actor, source: 'tracker' }] : [])
  ]);
  try { await pushFields(data, Object.keys(patch)); await sb.from('sync_log').insert({ direction:'db_to_sheet', issue_id: params.id, status:'success' }); }
  catch(e){ await sb.from('sync_log').insert({ direction:'db_to_sheet', issue_id: params.id, status:'failed', error_message:String(e.message||e) }); }
  return NextResponse.json({ data });
}
