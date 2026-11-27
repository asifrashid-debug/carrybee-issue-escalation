import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { canOpenTab } from '../../../lib/access';
import { visibleOpsIssues, canEditKamFeedback, withHubZone, opsKamPatterns, withOpsSource } from '../../../lib/opsIssues.mjs';
import { fetchAll, sourceIds } from '../../../lib/opsIssueSync';
export const dynamic = 'force-dynamic';

const COLS = 'sheet_spreadsheet_id,issue_id,consignment_id,merchant_name,issue_category,issue_sub_category,hub_feedback,hub_name,kam_name,issue_status,validation,kam_feedback,updated_at,raised_at,pick_due_at,picked_at,picked_by,in_progress_at,resolve_due_at,closed_at,closed_by,validated_at,validated_by';

// The KAM's own Ops Issues: rows whose kam_name matches the viewer's display name or kam_aliases. Admin sees all, read-only.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!canOpenTab(user.role, 'kam_issues')) return NextResponse.json({ error: 'Your role cannot open this tab' }, { status: 403 });
  const sb = supabaseAdmin();
  let rows, hubs;
  try {
    // Only the viewer's own KAM names (and the CM queue for CM roles) are read. The database does this match;
    // visibleOpsIssues below still applies the exact rule, so this can only narrow the rows read, never widen them.
    const pats = opsKamPatterns(user);
    if (pats && pats.length === 0) rows = [];
    else rows = await fetchAll(() => {
      let q = sb.from('ops_issues').select(COLS).not('kam_name', 'is', null);
      if (pats) q = q.or(pats.map((p) => `kam_name.ilike.${p}`).join(','));
      return q.order('issue_id');
    });
    // Zone comes from hub_master (not stored on ops_issues). Inactive hubs are included so older issues keep their zone.
    hubs = await fetchAll(() => sb.from('hub_master').select('hub_name,zone').order('hub_name'));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  // source: which OPS-KAM tab the issue belongs to (hub, ir, sort, tnl). Added after the visibility rule, so it cannot widen what the viewer sees.
  const issues = withOpsSource(visibleOpsIssues(user, withHubZone(rows, hubs)), sourceIds()).map((i) => ({ ...i, can_edit: canEditKamFeedback(user, i) }));
  // viewer: the signed-in email. The Ops-KAM badge uses it as the key for the "seen" list.
  return NextResponse.json({ issues, viewer: user.email });
}
