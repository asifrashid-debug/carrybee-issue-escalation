import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { canOpenTab } from '../../../lib/access';
import { visibleOpsIssues, canEditKamFeedback } from '../../../lib/opsIssues.mjs';
import { fetchAll } from '../../../lib/opsIssueSync';
export const dynamic = 'force-dynamic';

const COLS = 'issue_id,consignment_id,merchant_name,issue_category,issue_sub_category,hub_feedback,kam_name,issue_status,validation,kam_feedback,updated_at';

// The KAM's own Ops Issues: rows whose kam_name matches the viewer's display name or kam_aliases. Admin sees all, read-only.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!canOpenTab(user.role, 'kam_issues')) return NextResponse.json({ error: 'Your role cannot open this tab' }, { status: 403 });
  const sb = supabaseAdmin();
  let rows;
  try {
    rows = await fetchAll(() => sb.from('ops_issues').select(COLS).not('kam_name', 'is', null).order('issue_id'));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  const issues = visibleOpsIssues(user, rows).map((i) => ({ ...i, can_edit: canEditKamFeedback(user, i) }));
  return NextResponse.json({ issues });
}
