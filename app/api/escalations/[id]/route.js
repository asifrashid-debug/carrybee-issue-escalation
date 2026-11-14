import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { pushToSheet } from '../../../../lib/sheets';
export const dynamic = 'force-dynamic';
const OPS_FIELDS = ['comments_1','comments_2','ops_issue_status','remarks','regional_lead','division','ops_status','validation','ops_category'];
const REQUESTER_PREPICK = ['issue_details','issue_category','issue_sub_category','priority_scale'];
const REQUESTER_POSTPICK = ['kam_feedback_status','issue_status'];
export async function PATCH(req, { params }) {
  const sb = supabaseAdmin();
  const id = params.id;
  const body = await req.json();
  const actor = body.actor_email || 'unknown@carrybee.com';
  const source = body.source || 'tracker';
  const { data: cur, error: e1 } = await sb.from('escalations').select('*').eq('issue_id', id).single();
  if (e1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const patch = {};
  const audits = [];
  const nowIso = new Date().toISOString();
  const firstComment = (body.comments_1?.trim() && !cur.comments_1?.trim()) || (body.comments_2?.trim() && !cur.comments_2?.trim());
  if (firstComment && !cur.issue_response_datetime) patch.issue_response_datetime = nowIso;
  if (body.ops_issue_status === 'Picked' && !cur.issue_pick_time) patch.issue_pick_time = nowIso;
  const nextOpsStatus = body.ops_issue_status ?? cur.ops_issue_status;
  const nextRemarks = body.remarks ?? cur.remarks;
  if (nextOpsStatus === 'Unresolved' && !nextRemarks?.trim()) return NextResponse.json({ error: 'Remarks is mandatory for Unresolved.' }, { status: 400 });
  const nextValidation = body.validation ?? cur.validation;
  const nextOpsStatus2 = body.ops_status ?? cur.ops_status;
  if ((nextValidation === 'Invalid' || nextValidation === 'Duplicate' || nextOpsStatus2 === 'Dropped') && !nextRemarks?.trim()) return NextResponse.json({ error: 'Remarks is mandatory for Invalid/Duplicate/Dropped.' }, { status: 400 });
  for (const f of [...OPS_FIELDS, ...REQUESTER_PREPICK, ...REQUESTER_POSTPICK]) {
    if (body[f] !== undefined && body[f] !== cur[f]) {
      if (['submitted_at','issue_pick_time','issue_response_datetime','week'].includes(f)) continue;
      patch[f] = body[f];
      audits.push({ issue_id: id, field_name: f, old_value: cur[f] ? String(cur[f]) : null, new_value: body[f] ? String(body[f]) : null, actor_email: actor, source });
    }
  }
  if (body.zone && body.zone !== cur.zone) {
    if (body.actor_role !== 'admin') return NextResponse.json({ error: 'Zone change is Admin only.' }, { status: 403 });
    patch.zone = body.zone;
    audits.push({ issue_id: id, field_name: 'zone', old_value: cur.zone, new_value: body.zone, actor_email: actor, source: 'admin' });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: cur, message: 'No changes' });
  patch.row_version = (cur.row_version||1) + 1;
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (audits.length) await sb.from('audit_log').insert(audits);
  try {
    const r = await pushToSheet(data);
    await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), sheet_row_number: r.row }).eq('issue_id', id);
    await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: id, status: 'success', payload: { action: r.action, row: r.row } });
  } catch (e) {
    await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: id, status: 'failed', error_message: String(e.message||e), retries: 1 });
  }
  return NextResponse.json({ data });
}
export async function GET(req, { params }) {
  const sb = supabaseAdmin();
  const { data: esc } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: audit } = await sb.from('audit_log').select('*').eq('issue_id', params.id).order('created_at', { ascending: true });
  return NextResponse.json({ data: esc, audit: audit||[] });
}
