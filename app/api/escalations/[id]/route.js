import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { pushToSheet, pushFields } from '../../../../lib/sheets';
import { isHubRole, HUB_BLOCKED_MESSAGE, LAYER_BLOCKED_MESSAGE } from '../../../../lib/hubPolicy';
import { requireUser } from '../../../../lib/session';
import { loadScope, isVisible } from '../../../../lib/visibility';
import { priorityForIssueType } from '../../../../lib/priority';
import { feedbackWriteBlock, feedbackView } from '../../../../lib/feedback';
import { pickBlock, pickView } from '../../../../lib/pickSla';
import { indexCategories, resolutionCheck } from '../../../../lib/categorySla';
export const dynamic = 'force-dynamic';
const LAYER_FIELDS = ['layer1_response','layer2_response','layer3_response'];
const OPS_FIELDS = [...LAYER_FIELDS,'ops_issue_status','remarks','regional_lead','division','ops_status','validation','ops_category'];
const REQUESTER_PREPICK = ['issue_details','issue_category','issue_sub_category']; // priority is derived from the sub category
const REQUESTER_POSTPICK = ['issue_status']; // KAM feedback has its own rules below
export async function PATCH(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const id = params.id;
  const body = await req.json();
  const actor = session.email;
  const source = body.source || 'tracker';
  const { data: cur, error: e1 } = await sb.from('escalations').select('*').eq('issue_id', id).single();
  if (e1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 }); // not visible to this viewer
  // Hub layer responses come only from the hub response sheet (webhook), for every role.
  if (LAYER_FIELDS.some((f) => body[f] !== undefined)) return NextResponse.json({ error: LAYER_BLOCKED_MESSAGE }, { status: 403 });
  const touchesOps = OPS_FIELDS.some((f) => body[f] !== undefined) || body.ops_issue_status === 'Picked';
  if (touchesOps && isHubRole(session.role)) return NextResponse.json({ error: HUB_BLOCKED_MESSAGE }, { status: 403 });
  const patch = {};
  const audits = [];
  const nowIso = new Date().toISOString();
  // Response stamp: first time ANY layer cell gets text (set-once)
  const firstLayerResponse = LAYER_FIELDS.some(f => body[f]?.trim() && !cur[f]?.trim());
  if (firstLayerResponse && !cur.issue_response_datetime) patch.issue_response_datetime = nowIso;
  if (body.ops_issue_status === 'Picked' && !cur.issue_pick_time) {
    const blockedPick = pickBlock(session, cur);
    if (blockedPick) return NextResponse.json({ error: blockedPick.error }, { status: blockedPick.status });
    patch.issue_pick_time = nowIso;
    if (cur.cm_assigned) patch.pick_missed = new Date(nowIso) > new Date(cur.pick_due_at);
  }
  const nextOpsStatus = body.ops_issue_status ?? cur.ops_issue_status;
  const nextRemarks = body.remarks ?? cur.remarks;
  if (nextOpsStatus === 'Unresolved' && !nextRemarks?.trim()) return NextResponse.json({ error: 'Remarks is mandatory for Unresolved.' }, { status: 400 });
  const nextValidation = body.validation ?? cur.validation;
  const nextOpsStatus2 = body.ops_status ?? cur.ops_status;
  if ((nextValidation === 'Invalid' || nextValidation === 'Duplicate' || nextOpsStatus2 === 'Not possible') && !nextRemarks?.trim()) return NextResponse.json({ error: 'Remarks is mandatory for Invalid/Duplicate/Not possible.' }, { status: 400 });
  // Category or sub category change: the pair must exist in the requester list, and priority follows it.
  const nextCat = body.issue_category ?? cur.issue_category;
  const nextSub = body.issue_sub_category ?? cur.issue_sub_category;
  if (body.issue_category !== undefined || body.issue_sub_category !== undefined) {
    const { data: pair } = await sb.from('category_master').select('issue_type').eq('side', 'requester').eq('is_active', true)
      .eq('category', nextCat || '').eq('sub_category', nextSub || '').maybeSingle();
    if (!pair) return NextResponse.json({ error: 'Choose a category and sub category from the list.' }, { status: 400 });
    const derived = priorityForIssueType(pair.issue_type);
    if (derived && derived !== cur.priority_scale) {
      patch.priority_scale = derived;
      audits.push({ issue_id: id, field_name: 'priority_scale', old_value: cur.priority_scale, new_value: derived, actor_email: actor, source });
    }
  }
  // KAM feedback: owner gives Resolved / Not Resolved / Improper Remarks, within the 24h window or after a justification.
  if (body.kam_feedback_status !== undefined && body.kam_feedback_status !== cur.kam_feedback_status) {
    const requester = (await sb.from('users_roles').select('email, role, teams').eq('email', cur.email).eq('is_active', true).maybeSingle()).data;
    const block = feedbackWriteBlock(session, cur, body.kam_feedback_status, requester, new Date());
    if (block) return NextResponse.json({ error: block.error }, { status: block.status });
    patch.kam_feedback_status = body.kam_feedback_status;
    patch.feedback_given_at = nowIso;
    audits.push({ issue_id: id, field_name: 'kam_feedback_status', old_value: cur.kam_feedback_status, new_value: body.kam_feedback_status, actor_email: actor, source });
  }
  // Completed At drives the Issue Resolution SLA column in the sheets.
  if (body.ops_status !== undefined && body.ops_status !== cur.ops_status) patch.completed_at = body.ops_status === 'Completed' ? nowIso : null;
  for (const f of [...OPS_FIELDS, ...REQUESTER_PREPICK, ...REQUESTER_POSTPICK]) {
    if (body[f] !== undefined && body[f] !== cur[f]) {
      if (['submitted_at','issue_pick_time','issue_response_datetime','week'].includes(f)) continue;
      patch[f] = body[f];
      audits.push({ issue_id: id, field_name: f, old_value: cur[f] ? String(cur[f]) : null, new_value: body[f] ? String(body[f]) : null, actor_email: actor, source });
    }
  }
  if (body.zone && body.zone !== cur.zone) {
    if (session.role !== 'admin') return NextResponse.json({ error: 'Zone change is Admin only.' }, { status: 403 });
    patch.zone = body.zone;
    audits.push({ issue_id: id, field_name: 'zone', old_value: cur.zone, new_value: body.zone, actor_email: actor, source: 'admin' });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: cur, message: 'No changes' });
  patch.row_version = (cur.row_version||1) + 1;
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (audits.length) await sb.from('audit_log').insert(audits);
  try {
    // Zone change moves the row to another sheet: full write. Otherwise write only the changed cells.
    const r = patch.zone ? await pushToSheet(data) : await pushFields(data, Object.keys(patch));
    await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), sheet_row_number: r.row }).eq('issue_id', id);
    await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: id, status: 'success', payload: { action: r.action, row: r.row } });
  } catch (e) {
    await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: id, status: 'failed', error_message: String(e.message||e), retries: 1 });
  }
  return NextResponse.json({ data });
}
export async function GET(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const { data: esc } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), esc)) return NextResponse.json({ error: 'Not found' }, { status: 404 }); // not visible to this viewer
  const [{ data: audit }, { data: justs }, { data: requester }, { data: pickJusts }] = await Promise.all([
    sb.from('audit_log').select('*').eq('issue_id', params.id).order('created_at', { ascending: true }),
    sb.from('kam_feedback_justifications').select('round, justification, submitted_by, submitted_at').eq('issue_id', params.id).order('round', { ascending: true }),
    sb.from('users_roles').select('email, role, teams').eq('email', esc.email).eq('is_active', true).maybeSingle(),
    sb.from('pick_justifications').select('round, justification, submitted_by, submitted_at').eq('issue_id', params.id).order('round', { ascending: true }),
  ]);
  const feedback = feedbackView(session, esc, justs || [], requester, new Date());
  const pick = pickView(session, esc, pickJusts || [], new Date());
  const { data: cats } = await sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true);
  const res = resolutionCheck(esc, indexCategories(cats || []), Date.now());
  return NextResponse.json({ data: { ...esc, feedback_phase: feedback.phase, pick_phase: pick.phase, resolution_days: res.days, resolution_due_at: res.dueAt, resolution_breach: res.breach }, audit: audit||[], feedback, pick });
}
