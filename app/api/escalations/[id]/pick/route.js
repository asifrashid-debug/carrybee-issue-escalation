import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { pushToSheet } from '../../../../../lib/sheets';
export const dynamic = 'force-dynamic';
export async function POST(req, { params }) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(()=>({}));
  const actor = body.actor_email || 'unknown@carrybee.com';
  const { data: cur } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (cur.issue_pick_time) return NextResponse.json({ error: 'Already picked. Pick Time is set-once and immutable.' }, { status: 400 });
  const now = new Date().toISOString();
  const { data, error } = await sb.from('escalations').update({ issue_pick_time: now, ops_issue_status: 'Picked', row_version: (cur.row_version||1)+1 }).eq('issue_id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert([
    { issue_id: params.id, field_name: 'issue_pick_time', old_value: null, new_value: now, actor_email: actor, source: 'tracker' },
    { issue_id: params.id, field_name: 'ops_issue_status', old_value: cur.ops_issue_status, new_value: 'Picked', actor_email: actor, source: 'tracker' }
  ]);
  try { await pushToSheet(data); await sb.from('sync_log').insert({ direction:'db_to_sheet', issue_id: params.id, status:'success' }); }
  catch(e){ await sb.from('sync_log').insert({ direction:'db_to_sheet', issue_id: params.id, status:'failed', error_message:String(e.message||e) }); }
  return NextResponse.json({ data });
}
