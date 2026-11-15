import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { pushFields } from '../../../../lib/sheets';
import { requireUser } from '../../../../lib/session';
import { loadScope } from '../../../../lib/visibility';
import { bulkFeedbackPlan, BULK_LIMIT } from '../../../../lib/bulkFeedback';
export const dynamic = 'force-dynamic';

// POST { issue_ids: string[], outcome: 'Resolved' | 'Not Resolved' }
// Team leads only. Sets KAM feedback on visible issues of their team(s), skipping any already set.
// Team lead rule: applies outside the 24h window and the justification steps (the team lead records it).
export async function POST(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const body = await req.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.issue_ids) ? body.issue_ids : []).map(String))];
  if (!ids.length) return NextResponse.json({ error: 'Select at least one issue.' }, { status: 400 });
  if (ids.length > BULK_LIMIT) return NextResponse.json({ error: `Select up to ${BULK_LIMIT} issues at a time.` }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: rows, error } = await sb.from('escalations').select('*').in('issue_id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const scope = await loadScope(sb, session);
  const plan = bulkFeedbackPlan(session, rows || [], scope, body.outcome);
  if (plan.error) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const now = new Date().toISOString();
  const updated = [];
  const failed = [];
  for (const cur of plan.allowed) {
    const patch = { kam_feedback_status: body.outcome, feedback_given_at: now, row_version: (cur.row_version || 1) + 1 };
    const { data, error: upErr } = await sb.from('escalations').update(patch).eq('issue_id', cur.issue_id).select().single();
    if (upErr) { failed.push({ issue_id: cur.issue_id, reason: upErr.message }); continue; }
    await sb.from('audit_log').insert({ issue_id: cur.issue_id, field_name: 'kam_feedback_status', old_value: cur.kam_feedback_status, new_value: body.outcome, actor_email: session.email, source: 'tracker_bulk' });
    try {
      const r = await pushFields(data, ['kam_feedback_status']);
      await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), sheet_row_number: r.row }).eq('issue_id', cur.issue_id);
      await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: cur.issue_id, status: 'success', payload: { action: r.action, row: r.row, bulk: true } });
    } catch (e) {
      await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: cur.issue_id, status: 'failed', error_message: String(e.message || e), retries: 1 });
    }
    updated.push(cur.issue_id);
  }
  const missing = ids.filter((id) => !(rows || []).some((r) => r.issue_id === id)).map((issue_id) => ({ issue_id, reason: 'Not found' }));
  return NextResponse.json({ ok: true, outcome: body.outcome, updated, skipped: [...plan.skipped, ...missing], failed });
}
