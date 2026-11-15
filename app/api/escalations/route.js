import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { pushToSheet } from '../../../lib/sheets';
import { isoWeek } from '../../../lib/time';
import { loadScope, scopeFilter } from '../../../lib/visibility';
import { requireUser } from '../../../lib/session';
import { lookupBusiness } from '../../../lib/business';
import { priorityForIssueType } from '../../../lib/priority';
import { feedbackPhase, windowEndFrom, FEEDBACK_PENDING } from '../../../lib/feedback';
import { pickDeadline, pickJustifyDueFrom, pickPhase } from '../../../lib/pickSla';
import { indexCategories, resolutionCheck } from '../../../lib/categorySla';

export const dynamic = 'force-dynamic';

// Pick failure: first time an issue is seen as escalated for the CM lead, stamp it and audit once.
async function stampPickFailures(sb, rows, now) {
  const todo = rows.filter((r) => r.pick_phase === 'escalated' && !r.pick_escalated_at);
  if (!todo.length) return;
  const at = now.toISOString();
  await sb.from('escalations').update({ pick_escalated_at: at }).in('issue_id', todo.map((r) => r.issue_id)).is('pick_escalated_at', null);
  await sb.from('audit_log').insert(todo.map((r) => ({ issue_id: r.issue_id, field_name: 'pick_escalated', old_value: null, new_value: 'Raised to CM Lead', actor_email: 'system', source: 'system' })));
}

// Feedback failure: first time an issue is seen as escalated, stamp it and audit once.
async function stampEscalations(sb, rows, now) {
  const todo = rows.filter((r) => r.feedback_phase === 'escalated' && !r.feedback_escalated_at);
  if (!todo.length) return;
  const at = now.toISOString();
  await sb.from('escalations').update({ feedback_escalated_at: at }).in('issue_id', todo.map((r) => r.issue_id)).is('feedback_escalated_at', null);
  await sb.from('audit_log').insert(todo.map((r) => ({ issue_id: r.issue_id, field_name: 'feedback_escalated', old_value: null, new_value: 'Raised to Team Lead', actor_email: 'system', source: 'system' })));
}

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
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
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
  // Visibility comes from the signed-in session, not the URL (lib/roles.js rules)
  const scope = await loadScope(sb, session);
  if (!scope.all) q = q.or(scopeFilter(scope));
  const view = searchParams.get('view');
  // KAM feedback views (24h window missed): 'overdue' = justification due, 'failure' = raised to Team Lead
  const fb = searchParams.get('feedback');
  if (fb === 'overdue') q = q.eq('kam_feedback_status', FEEDBACK_PENDING).lt('feedback_due_at', new Date().toISOString()).lt('feedback_justifications', 2);
  if (fb === 'failure') q = q.eq('kam_feedback_status', FEEDBACK_PENDING).lt('feedback_due_at', new Date().toISOString()).gte('feedback_justifications', 2);
  // Pick failures (CM pick SLA): missed or late pick, a justification window passed, fewer than 2 justifications
  if (searchParams.get('pick') === 'failure') q = q.eq('cm_assigned', true).lt('pick_justify_due_at', new Date().toISOString()).lt('pick_justifications', 2).or('pick_missed.eq.true,issue_pick_time.is.null');
  // My escalations: issues I raised, plus issues I picked (audit_log picks, loaded in lib/visibility.js)
  if (view === 'mine') {
    const ids = scope.pickedIds || [];
    const parts = [`email.eq.${session.email}`];
    if (ids.length) parts.push(`issue_id.in.(${ids.map((i) => `"${i}"`).join(',')})`);
    q = q.or(parts.join(','));
  }
  if (view === 'unpicked') q = q.is('issue_pick_time', null);
  if (view === 'awaiting') q = q.is('issue_response_datetime', null).neq('ops_issue_status','Resolved');
  if (view === 'resolved_week') { const d = new Date(); d.setDate(d.getDate()-7); q = q.eq('ops_issue_status','Resolved').gte('updated_at', d.toISOString()); }
  const search = searchParams.get('search');
  if (search) q = q.or(`issue_id.ilike.%${search}%,consignment_id.ilike.%${search}%,merchant_name.ilike.%${search}%`);
  // Resolved-this-week count for the KPI card: same zone and visibility as this list, returned in the same response.
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  let rwq = sb.from('escalations').select('issue_id', { count: 'exact', head: true }).eq('ops_issue_status', 'Resolved').gte('updated_at', weekAgo.toISOString());
  if (searchParams.get('zone')) rwq = rwq.eq('zone', searchParams.get('zone'));
  if (!scope.all) rwq = rwq.or(scopeFilter(scope));
  // Run the list, the resolved count and the category lookup together (one database round trip instead of three)
  const [{ data, error, count }, rw, { data: cats }] = await Promise.all([
    q,
    rwq,
    // Category SLA (days per zone) from category_master; adds resolution due date and breach flag per row
    sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const now = new Date();
  const catIndex = indexCategories(cats || []);
  const rows = (data || []).map((e) => {
    const r = resolutionCheck(e, catIndex, now.getTime());
    return { ...e, feedback_phase: feedbackPhase(e, now), pick_phase: pickPhase(e, now), resolution_days: r.days, resolution_due_at: r.dueAt, resolution_breach: r.breach };
  });
  await stampEscalations(sb, rows, now);
  await stampPickFailures(sb, rows, now);
  return NextResponse.json({ data: rows, count, page, pageSize, resolved_week: rw.error ? null : (rw.count ?? 0) });
}

export async function POST(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const body = await req.json();
  if (body.channel !== 'KAM' && body.channel !== 'MX') {
    return NextResponse.json({ error: 'Channel must be KAM or MX.' }, { status: 400 });
  }
  const isKam = body.channel === 'KAM';
  // Validation AC-03. KAM form has no merchant box, so the Consignment ID is required there.
  if (isKam && !body.consignment_id?.trim()) {
    return NextResponse.json({ error: 'Consignment ID is required for KAM issues.' }, { status: 400 });
  }
  if (!isKam && !body.consignment_id?.trim() && !body.merchant_name?.trim()) {
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
  // Category and sub category must be an exact active pair from the requester list
  const { data: pair } = await sb.from('category_master').select('issue_type').eq('side', 'requester').eq('is_active', true)
    .eq('category', body.issue_category || '').eq('sub_category', body.issue_sub_category || '').maybeSingle();
  if (!pair) return NextResponse.json({ error: 'Choose a category and sub category from the list.' }, { status: 400 });
  // Priority is set by the sub category's issue type (Critical P1, Urgent P2, Regular P3). Client value is ignored.
  const priority_scale = priorityForIssueType(pair.issue_type);
  if (!priority_scale) return NextResponse.json({ error: 'This sub category has no priority set. Contact admin.' }, { status: 400 });
  // Business (MX only): a business ID or name is resolved to the business name and its KAM. No match -> 'CM'.
  let merchant_name = body.merchant_name?.trim() || null;
  let kam_name = body.kam_name?.trim() || null;
  if (isKam) {
    merchant_name = null; // KAM form does not capture a merchant
  } else {
    try {
      const biz = await lookupBusiness(sb, body.merchant_name);
      if (biz.found) merchant_name = biz.business_name;
      kam_name = biz.kam_name;
    } catch (e) {
      return NextResponse.json({ error: 'Business lookup failed. Try again.' }, { status: 500 });
    }
  }
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
    issue_id: idRow, submitted_at: now, email: session.email, consignment_id: body.consignment_id?.trim()||null, merchant_name,
    channel: body.channel, zone: hub.zone, concern_hub: body.concern_hub, issue_status: body.issue_status||'Open',
    issue_category: body.issue_category, issue_sub_category: body.issue_sub_category, issue_details: body.issue_details,
    kam_name, week: isoWeek(new Date(now)), priority_scale,
    kam_feedback_status: FEEDBACK_PENDING, feedback_due_at: windowEndFrom(now), feedback_justifications: 0, ops_issue_status: 'New', ops_status: 'Pending',
    cm_assigned: body.channel === 'MX' && String(kam_name || '').trim().toUpperCase() === 'CM',
    pick_due_at: null, pick_missed: false, pick_justifications: 0, pick_justify_due_at: null,
    regional_lead: hub.regional_lead, division: hub.division, duplicate_of, row_version: 1
  };
  if (row.cm_assigned) {
    row.pick_due_at = pickDeadline(now, priority_scale);
    row.pick_justify_due_at = pickJustifyDueFrom(row.pick_due_at);
  }
  const { data, error } = await sb.from('escalations').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(sb, data.issue_id, 'create', null, data.issue_id, session.email, 'form');
  await queueSync(sb, data);
  return NextResponse.json({ data, duplicate_warning }, { status: 201 });
}
