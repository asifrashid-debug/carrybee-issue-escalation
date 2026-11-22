import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/session';
import { canOpenTab } from '../../../../lib/access';
import { canEditKamFeedback, cleanKamFeedback } from '../../../../lib/opsIssues.mjs';
import { saveKamFeedback } from '../../../../lib/opsIssueSync';
export const dynamic = 'force-dynamic';

// KAM Feedback only. The issue must be named to the signed-in KAM (admin cannot write). The sheet is saved before the DB.
export async function PATCH(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!canOpenTab(user.role, 'kam_issues')) return NextResponse.json({ error: 'Your role cannot open this tab' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = cleanKamFeedback(body?.kam_feedback);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data: issue, error } = await supabaseAdmin().from('ops_issues')
    .select('issue_id,kam_name,sheet_spreadsheet_id,sheet_row_number')
    .eq('issue_id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  if (!canEditKamFeedback(user, issue)) return NextResponse.json({ error: 'This issue is not named to you' }, { status: 403 });
  try {
    await saveKamFeedback(issue, parsed.value);
  } catch (e) {
    return NextResponse.json({ error: 'Save failed: ' + e.message }, { status: 502 });
  }
  return NextResponse.json({ issue_id: issue.issue_id, kam_feedback: parsed.value });
}
