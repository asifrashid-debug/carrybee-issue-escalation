import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { loadScope } from '../../../../../lib/visibility';
import { bulkFeedbackPlan, BULK_LIMIT } from '../../../../../lib/bulkFeedback';
export const dynamic = 'force-dynamic';

// POST { issue_ids: string[], outcome: 'Resolved' | 'Not Resolved' }
// Review step for bulk KAM feedback. Writes nothing. Same checks as the commit route.
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
  const missing = ids.filter((id) => !(rows || []).some((r) => r.issue_id === id)).map((issue_id) => ({ issue_id, reason: 'Not found' }));
  return NextResponse.json({
    outcome: body.outcome,
    will_resolve: plan.allowed.map((r) => ({
      issue_id: r.issue_id,
      zone: r.zone,
      concern_hub: r.concern_hub,
      submitted_at: r.submitted_at,
      ops_issue_status: r.ops_issue_status,
      kam_feedback_status: r.kam_feedback_status,
      has_hub_response: !!String(r.layer1_response || '').trim(),
    })),
    skipped: [...plan.skipped, ...missing],
  });
}
