import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { notifyHubResponse } from '../../../../lib/notify';
export const dynamic = 'force-dynamic';
const LAYER_FIELDS = ['layer1_response','layer2_response','layer3_response'];
// Apps Script on-edit trigger posts { issue_id, field, new_value, editor_email, edit_time, secret }
export async function POST(req) {
  const sb = supabaseAdmin();
  const body = await req.json();
  if (process.env.WEBHOOK_SECRET && body.secret !== process.env.WEBHOOK_SECRET) return NextResponse.json({ error: 'Bad secret' }, { status: 401 });
  const { issue_id, field, new_value, editor_email } = body;
  if (!issue_id || !field) return NextResponse.json({ error: 'issue_id + field required' }, { status: 400 });
  const { data: cur } = await sb.from('escalations').select('*').eq('issue_id', issue_id).single();
  if (!cur) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  // Field ownership: Requester block -> DB wins (reject sheet edits)
  const REQUESTER = ['submitted_at','email','consignment_id','merchant_name','channel','zone','concern_hub','issue_status','issue_category','issue_sub_category','issue_details','kam_name','week','priority_scale'];  // KAM feedback is set only in the tracker (owner + 24h rules)
  if (REQUESTER.includes(field)) {
    await sb.from('audit_log').insert({ issue_id, field_name: field, old_value: cur[field]?String(cur[field]):null, new_value: String(new_value??''), actor_email: editor_email||'sheet', source: 'sheet' });
    await sb.from('sync_log').insert({ direction:'sheet_to_db', issue_id, status:'failed', error_message:`Rejected protected field ${field} (DB wins)` });
    return NextResponse.json({ ok: false, error: 'Protected field — DB wins, edit reverted' });
  }
  const patch = { [field]: new_value, row_version: (cur.row_version||1)+1 };
  // Completed At drives the Issue Resolution SLA column; keep the first completion time.
  if (field === 'ops_status') patch.completed_at = new_value === 'Completed' ? (cur.completed_at || new Date().toISOString()) : null;
  // Response stamping on first comment
  if (LAYER_FIELDS.includes(field) && new_value?.trim() && !cur.issue_response_datetime) patch.issue_response_datetime = new Date().toISOString();
  // Pick validation: must be valid datetime, not future, not before Timestamp
  if (field === 'issue_pick_time' && new_value) {
    const t = new Date(new_value);
    if (isNaN(t) || t > new Date() || t < new Date(cur.submitted_at)) {
      await sb.from('sync_log').insert({ direction:'sheet_to_db', issue_id, status:'failed', error_message:'Invalid pick time rejected' });
      return NextResponse.json({ ok: false, error: 'Invalid pick time — must be valid, not future, not before Timestamp' });
    }
    if (cur.issue_pick_time) return NextResponse.json({ ok: false, error: 'Pick time already set' });
  }
  // Auto-stamp pick when ISSUE STATUS first -> Picked
  if (field === 'ops_issue_status' && new_value === 'Picked' && !cur.issue_pick_time) patch.issue_pick_time = new Date().toISOString();
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', issue_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert({ issue_id, field_name: field, old_value: cur[field]?String(cur[field]):null, new_value: String(new_value??''), actor_email: editor_email||'sheet', source: 'sheet' });
  await sb.from('sync_log').insert({ direction:'sheet_to_db', issue_id, status:'success', payload: body });
  // Bell notification for the raiser and the raiser's team leads (never blocks the sync)
  await notifyHubResponse(sb, data, field, new_value);
  return NextResponse.json({ ok: true, data });
}
