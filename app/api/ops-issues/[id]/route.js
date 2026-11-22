import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/session';
import { canOpenTab } from '../../../../lib/access';
import { canEditKamFeedback, cleanKamFeedback } from '../../../../lib/opsIssues.mjs';
import { applyAction, applyValidation } from '../../../../lib/opsLifecycle.mjs';
import { saveKamFeedback, applyLifecycle, applyValidationChange, OpsError } from '../../../../lib/opsIssueSync';
export const dynamic = 'force-dynamic';

const ISSUE_COLS = 'issue_id,kam_name,issue_status,validation,validated_at,validated_by,raised_at,pick_due_at,picked_at,picked_by,in_progress_at,resolve_due_at,closed_at,closed_by,sheet_spreadsheet_id,sheet_row_number';

const fail = (status, error) => NextResponse.json({ error }, { status });

// One write per request. The body is one of:
//   { action: 'pick' | 'start' | 'resolve' | 'not_resolved' }  status change (see lib/opsLifecycle.mjs)
//   { validation: 'Valid' | 'Invalid' | 'Duplicate' | 'No proper info' }
//   { kam_feedback: '...' }  free text
// Only the KAM the issue is named to can write. Admin is read-only.
export async function PATCH(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!canOpenTab(user.role, 'kam_issues')) return fail(403, 'Your role cannot open this tab');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail(400, 'Send a JSON body');
  const kinds = ['action', 'validation', 'kam_feedback'].filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (kinds.length !== 1) return fail(400, 'Send exactly one of: action, validation, kam_feedback');

  const { data: issue, error } = await supabaseAdmin().from('ops_issues')
    .select(ISSUE_COLS).eq('issue_id', params.id).maybeSingle();
  if (error) return fail(500, error.message);
  if (!issue) return fail(404, 'Issue not found');
  if (!canEditKamFeedback(user, issue)) return fail(403, 'This issue is not named to you');

  const now = new Date();
  try {
    if (kinds[0] === 'action') {
      const plan = applyAction(issue, body.action, user.email, now);
      if (plan.error) return fail(plan.status, plan.error);
      const patch = await applyLifecycle(issue, plan);
      return NextResponse.json({ issue_id: issue.issue_id, ...patch });
    }
    if (kinds[0] === 'validation') {
      const plan = applyValidation(issue, body.validation, user.email, now);
      if (plan.error) return fail(plan.status, plan.error);
      const patch = await applyValidationChange(issue, plan);
      return NextResponse.json({ issue_id: issue.issue_id, ...patch });
    }
    const parsed = cleanKamFeedback(body.kam_feedback);
    if (parsed.error) return fail(400, parsed.error);
    await saveKamFeedback(issue, parsed.value);
    return NextResponse.json({ issue_id: issue.issue_id, kam_feedback: parsed.value });
  } catch (e) {
    if (e instanceof OpsError) return fail(e.status, e.message);
    return fail(502, 'Save failed: ' + e.message);
  }
}
