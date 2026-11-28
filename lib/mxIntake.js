// MX API intake: creates one MX issue from the MX CRM. Same rules as the MX form (POST /api/escalations, channel MX),
// with three differences: the reporter comes from the request body (not a session), routing is always HUB,
// and each request is idempotent on external_id (mx_api_requests, migration 026).
import { supabaseAdmin } from './supabase.js';
import { pushToSheet } from './sheets.js';
import { lookupBusiness } from './business.js';
import { priorityForIssueType } from './priority.js';
import { windowEndFrom, FEEDBACK_PENDING } from './feedback.js';
import { pickDeadline, pickJustifyDueFrom } from './pickSla.js';
import { isoWeek } from './time.js';
import { nextCmOwner } from './cmAssign.js';
import { notifyNewCmIssue } from './notify.js';
import { MX_ROUTES } from './mxApi.mjs';

// Result shape: { status, body }. Never throws for a rule failure; throws only for unexpected database errors.
export async function submitMxIssue(clean, hash, sb = supabaseAdmin()) {
  const claim = await claimRequest(sb, clean, hash);
  if (claim.state === 'replay') return { status: 200, body: { ...(await issueSummary(sb, claim.issue_id)), replayed: true } };
  if (claim.state === 'conflict') {
    return { status: 409, body: { error: 'This external_id was already sent with different content.', code: 'external_id_conflict', external_id: clean.external_id } };
  }
  if (claim.state === 'in_progress') {
    return { status: 409, body: { error: 'This external_id is being processed. Try again in a few seconds.', code: 'in_progress', external_id: clean.external_id } };
  }
  const ctx = { issue_id: null, sync: null };
  try {
    const out = await createIssue(sb, clean, ctx);
    if (out.status !== 201) {
      await releaseClaim(sb, clean.external_id);
      return out;
    }
    await attachIssue(sb, clean.external_id, out.body.issue_id);
    return out;
  } catch (e) {
    if (ctx.issue_id) {
      // The issue IS saved. Releasing the claim here would let a retry create a second issue,
      // so keep the claim, point it at the saved issue, and report success.
      await attachIssue(sb, clean.external_id, ctx.issue_id);
      return { status: 201, body: { ...(await issueSummary(sb, ctx.issue_id)), sync: ctx.sync || 'queued', duplicate_warning: null } };
    }
    await releaseClaim(sb, clean.external_id); // nothing was saved, so the MX CRM can retry safely
    throw e;
  }
}

// Points the claim at the saved issue. Retried once; if both tries fail, the claim is logged for manual repair.
async function attachIssue(sb, external_id, issue_id) {
  for (let i = 0; i < 2; i++) {
    const { error } = await sb.from('mx_api_requests').update({ issue_id }).eq('external_id', external_id);
    if (!error) return;
  }
  console.error('mx_api: could not attach issue to claim', external_id, issue_id);
}

// Claims the external_id before any issue is created. A second request with the same id waits or replays.
async function claimRequest(sb, clean, hash) {
  const { error } = await sb.from('mx_api_requests').insert({ external_id: clean.external_id, request_hash: hash, issue_id: null });
  if (!error) return { state: 'new' };
  if (error.code !== '23505') throw new Error(error.message); // not a duplicate key: a real database error
  const { data } = await sb.from('mx_api_requests').select('request_hash, issue_id').eq('external_id', clean.external_id).maybeSingle();
  if (!data) return { state: 'in_progress' };
  if (data.request_hash !== hash) return { state: 'conflict' };
  if (!data.issue_id) return { state: 'in_progress' };
  return { state: 'replay', issue_id: data.issue_id };
}

async function releaseClaim(sb, external_id) {
  await sb.from('mx_api_requests').delete().eq('external_id', external_id).is('issue_id', null);
}

// The same summary the status lookup returns. Internal fields are not exposed.
export async function issueSummary(sb, issue_id) {
  const { data } = await sb.from('escalations').select('issue_id, submitted_at, zone, concern_hub, kam_name, issue_status, ops_issue_status, ops_status, route_hub')
    .eq('issue_id', issue_id).maybeSingle();
  if (!data) return { error: 'Issue not found', code: 'not_found' };
  return {
    issue_id: data.issue_id, submitted_at: data.submitted_at, zone: data.zone, concern_hub: data.concern_hub,
    kam_name: data.kam_name, issue_status: data.issue_status, ops_issue_status: data.ops_issue_status,
    ops_status: data.ops_status, routes: { hub: data.route_hub === true },
  };
}

async function createIssue(sb, clean, ctx) {
  const consignmentErr = await consignmentFormatError(sb, clean.consignment_id);
  if (consignmentErr) return bad('consignment_id', consignmentErr);

  const { data: hub } = await sb.from('hub_master').select('*').eq('hub_name', clean.concern_hub).maybeSingle();
  if (!hub) return bad('concern_hub', 'Concern Hub must match a name in Hub Master exactly.');

  // Requester list only (the API never raises IR-only issues).
  const { data: pair } = await sb.from('category_master').select('issue_type').eq('side', 'requester').eq('is_active', true)
    .eq('category', clean.issue_category).eq('sub_category', clean.issue_sub_category).maybeSingle();
  if (!pair) return bad('issue_sub_category', 'Category and sub category must be an active pair from the requester list.');
  const priority_scale = priorityForIssueType(pair.issue_type);
  if (!priority_scale) return bad('issue_sub_category', 'This sub category has no priority set.');

  // Business: a business ID or name gives the business name and its KAM. No match gives KAM 'CM'.
  const biz = await lookupBusiness(sb, clean.merchant_name);
  let merchant_name = clean.merchant_name || null;
  if (biz.found) merchant_name = biz.business_name;
  const kam_name = biz.kam_name;

  // Duplicate guard: same as the form (open issue, same consignment and category). The issue is still created.
  let duplicate_of = null, duplicate_warning = null;
  if (clean.consignment_id) {
    const { data: dup } = await sb.from('escalations').select('issue_id').eq('consignment_id', clean.consignment_id)
      .eq('issue_category', clean.issue_category).neq('issue_status', 'Closed').limit(1);
    if (dup?.length) { duplicate_of = dup[0].issue_id; duplicate_warning = `Potential duplicate: open issue ${duplicate_of} with same Consignment ID + Category.`; }
  }

  const { data: idRow, error: idErr } = await sb.rpc('next_issue_id');
  if (idErr) throw new Error(idErr.message);

  const now = new Date().toISOString();
  const cm_assigned = String(kam_name || '').trim().toUpperCase() === 'CM';
  const row = {
    issue_id: idRow, submitted_at: now, email: clean.reporter_email, consignment_id: clean.consignment_id, merchant_name,
    channel: 'MX', zone: hub.zone, concern_hub: clean.concern_hub, issue_status: 'Open',
    issue_category: clean.issue_category, issue_sub_category: clean.issue_sub_category, issue_details: clean.issue_details,
    kam_name, week: isoWeek(new Date(now)), priority_scale,
    kam_feedback_status: FEEDBACK_PENDING, feedback_due_at: windowEndFrom(now), feedback_justifications: 0, ops_issue_status: 'New', ops_status: 'Pending',
    cm_assigned, pick_due_at: null, pick_missed: false, pick_justifications: 0, pick_justify_due_at: null,
    regional_lead: hub.regional_lead, division: hub.division, duplicate_of, row_version: 1,
    route_hub: MX_ROUTES.hub, route_ir: MX_ROUTES.ir, route_central_sort: MX_ROUTES.central_sort, route_tnl: MX_ROUTES.tnl,
    mail_subject: null, drive_link: null, attachment_name: null, ir_resolve_sla_days: null,
  };
  row.business_pick_time = cm_assigned ? null : now;
  if (cm_assigned) {
    row.pick_due_at = pickDeadline(now, priority_scale);
    row.pick_justify_due_at = pickJustifyDueFrom(row.pick_due_at);
    const { data: cmMembers } = await sb.from('users_roles').select('email').eq('role', 'cm_member').eq('is_active', true);
    const { data: lastCm } = await sb.from('escalations').select('cm_owner_email').eq('cm_assigned', true).not('cm_owner_email', 'is', null)
      .order('submitted_at', { ascending: false }).limit(1);
    row.cm_owner_email = nextCmOwner((cmMembers || []).map((m) => m.email), lastCm?.[0]?.cm_owner_email || null);
  }

  const { data, error } = await sb.from('escalations').insert(row).select().single();
  if (error) throw new Error(error.message);
  ctx.issue_id = data.issue_id; // from here on the issue exists: nothing below may release the claim
  // Audit: the form writes source 'form'. The database allows only form, tracker, sheet, system, admin and reconciliation,
  // so the API writes 'system', with the reporter's email as the actor.
  const audit = await sb.from('audit_log').insert({ issue_id: data.issue_id, field_name: 'create', old_value: null, new_value: data.issue_id, actor_email: clean.reporter_email, source: 'system' });
  if (audit?.error) console.error('mx_api: audit insert failed', data.issue_id, audit.error.message);
  const sync = await queueHubSync(sb, data);
  ctx.sync = sync;
  try { await notifyNewCmIssue(sb, data); } catch (e) { console.error('mx_api: CM notification failed', data.issue_id, String(e.message || e)); }
  return {
    status: 201,
    body: {
      ...(await issueSummary(sb, data.issue_id)),
      sync,
      duplicate_warning,
    },
  };
}

async function consignmentFormatError(sb, consignment_id) {
  if (!consignment_id) return null;
  const { data: cfg } = await sb.from('app_config').select('value').eq('key', 'validation').single();
  const re = cfg?.value?.consignment_id_regex;
  if (!re) return null;
  try {
    return new RegExp(re).test(consignment_id.toUpperCase()) ? null : `Consignment ID format invalid. Expected pattern ${re}`;
  } catch {
    return null;
  }
}

function bad(field, message) {
  return { status: 400, body: { error: 'Validation failed', errors: [{ field, message }] } };
}

// HUB sheet write, logged like the form's queueSync. A failed write does not undo the issue; sync_log shows it.
async function queueHubSync(sb, esc) {
  const { data, error } = await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: esc.issue_id, spreadsheet_id: null, status: 'queued', payload: esc }).select().single();
  if (error) return 'queued';
  try {
    const r = await pushToSheet(esc);
    await sb.from('sync_log').update({ status: 'success', updated_at: new Date().toISOString() }).eq('id', data.id);
    await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), sheet_row_number: r.row }).eq('issue_id', esc.issue_id);
    return 'success';
  } catch (e) {
    await sb.from('sync_log').update({ status: 'failed', error_message: String(e.message || e), retries: 1, updated_at: new Date().toISOString() }).eq('id', data.id);
    return 'failed';
  }
}
