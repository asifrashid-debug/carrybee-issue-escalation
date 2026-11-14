import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { pushToSheet } from '../../../lib/sheets';
import { isoWeek } from '../../../lib/time';

export const dynamic = 'force-dynamic';

async function audit(sb, issue_id, field, oldV, newV, actor, source) {
  await sb.from('audit_log').insert({ issue_id, field_name: field, old_value: oldV ? String(oldV) : null, new_value: newV ? String(newV) : null, actor_email: actor, source });
}
async function queueSync(sb, esc, direction='db_to_sheet') {
  const { data, error } = await sb.from('sync_log').insert({ direction, issue_id: esc.issue_id, spreadsheet_id: null, status: 'queued', payload: esc }).select().single();
  if (error) return;
  try {
    const r = await pushToSheet(esc);
    await sb.from('sync_log').update({ status: 'success', updated_at: new Date().toISOString() }).eq('id', data.id);
    await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), sheet_row_number: r.row }).eq('issue_id', esc.issue_id);
  } catch (e) {
    await sb.from('sync_log').update({ status: 'failed', error_message: String(e.message||e), retries: 1, updated_at: new Date().toISOString() }).eq('id', data.id);
  }
}

export async function GET(req) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page')||'1'));
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize')||'25'));
  const from = (page-1)*pageSize, to = from+pageSize-1;
  let q = sb.from('escalations').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  const eq = (k, col) => { const v = searchParams.get(k); if (v) q = q.eq(col, v); };
  eq('zone','zone'); eq('channel','channel'); eq('issue_status','issue_status'); eq('ops_issue_status','ops_issue_status');
  eq('ops_status','ops_status'); eq('validation','validation'); eq('priority_scale','priority_scale'); eq('week','week');
  eq('concern_hub','concern_hub'); eq('regional_lead','regional_lead'); eq('division','division');
  eq('issue_category','issue_category'); eq('issue_sub_category','issue_sub_category');
  const mine = searchParams.get('mine'); if (mine) q = q.eq('email', mine);
  const view = searchParams.get('view');
  if (view === 'unpicked') q = q.is('issue_pick_time', null);
  if (view === 'awaiting') q = q.is('issue_response_datetime', null).neq('ops_issue_status','Resolved');
  if (view === 'resolved_week') { const d = new Date(); d.setDate(d.getDate()-7); q = q.eq('ops_issue_status','Resolved').gte('updated_at', d.toISOString()); }
  const search = searchParams.get('search');
  if (search) q = q.or(`issue_id.ilike.%${search}%,consignment_id.ilike.%${search}%,merchant_name.ilike.%${search}%`);
  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, count, page, pageSize });
}

export async function POST(req) {
  const sb = supabaseAdmin();
  const body = await req.json();
  // Validation AC-03
  if (!body.consignment_id?.trim() && !body.merchant_name?.trim()) {
    return NextResponse.json({ error: 'Consignment ID and Merchant Name cannot both be empty. Provide at least one.' }, { status: 400 });
  }
  if (!body.issue_details || body.issue_details.trim().length < 20) {
    return NextResponse.json({ error: 'Issue Details must be at least 20 characters.' }, { status: 400 });
  }
  // Consignment regex (configurable)
  const { data: cfg } = await sb.from('app_config').select('value').eq('key','validation').single();
  const re = cfg?.value?.consignment_id_regex;
  if (body.consignment_id?.trim() && re) {
    try { if (!new RegExp(re).test(body.consignment_id.trim().toUpperCase())) return NextResponse.json({ error: `Consignment ID format invalid. Expected pattern ${re}` }, { status: 400 }); } catch {}
  }
  // Hub must exist (no free text)
  const { data: hub } = await sb.from('hub_master').select('*').eq('hub_name', body.concern_hub).single();
  if (!hub) return NextResponse.json({ error: 'Concern Hub must be selected from Hub Master (no free text).' }, { status: 400 });
  // Duplicate guard: open issue same consignment + category
  let duplicate_of = null, duplicate_warning = null;
  if (body.consignment_id?.trim()) {
    const { data: dup } = await sb.from('escalations').select('issue_id').eq('consignment_id', body.consignment_id.trim()).eq('issue_category', body.issue_category).neq('issue_status','Closed').limit(1);
    if (dup?.length) { duplicate_of = dup[0].issue_id; duplicate_warning = `Potential duplicate: open issue ${duplicate_of} with same Consignment ID + Category.`; }
  }
  const { data: idRow, error: idErr } = await sb.rpc('next_issue_id');
  if (idErr) return NextResponse.json({ error: idErr.message }, { status: 500 });
  const now = new Date().toISOString();
  const row = {
    issue_id: idRow, submitted_at: now, email: body.email, consignment_id: body.consignment_id?.trim()||null, merchant_name: body.merchant_name?.trim()||null,
    channel: body.channel, zone: body.zone || hub.zone, concern_hub: body.concern_hub, issue_status: body.issue_status||'Open',
    issue_category: body.issue_category, issue_sub_category: body.issue_sub_category, issue_details: body.issue_details,
    kam_name: body.kam_name||null, week: isoWeek(new Date(now)), priority_scale: body.priority_scale,
    kam_feedback_status: body.kam_feedback_status||'Not Shared', ops_issue_status: 'New', ops_status: 'Pending',
    regional_lead: hub.regional_lead, division: hub.division, duplicate_of, row_version: 1
  };
  const { data, error } = await sb.from('escalations').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(sb, data.issue_id, 'create', null, data.issue_id, body.email, 'form');
  await queueSync(sb, data);
  return NextResponse.json({ data, duplicate_warning }, { status: 201 });
}
