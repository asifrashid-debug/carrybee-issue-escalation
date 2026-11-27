import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/session';
import { canOpenTab } from '../../../../lib/access';
import { visibleOpsIssues, withHubZone, withOpsSource, opsKamPatterns, OPS_SOURCE_TABS } from '../../../../lib/opsIssues.mjs';
import { fetchAll, sourceIds } from '../../../../lib/opsIssueSync';
import { resolveRange, rangeBounds } from '../../../../lib/dateRange';
import { buildOpsSourceAnalytics } from '../../../../lib/opsSourceAnalytics.mjs';
export const dynamic = 'force-dynamic';

const COLS = 'sheet_spreadsheet_id,issue_id,merchant_name,issue_category,issue_sub_category,hub_name,kam_name,issue_status,validation,kam_feedback,raised_at,pick_due_at,picked_at,resolve_due_at,closed_at';
const SOURCES = OPS_SOURCE_TABS.filter((t) => t.key !== 'all').map((t) => t.key);

// GET /api/kam/analytics?source=hub|ir|sort|tnl&range=7d  (or &from=YYYY-MM-DD&to=YYYY-MM-DD)
// Analytics for one OPS-KAM source tab. Same visibility as the Ops-KAM list, and the date range applies to raised_at.
export async function GET(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!canOpenTab(user.role, 'kam_analytics')) return NextResponse.json({ error: 'Your role cannot open this tab' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');
  if (!SOURCES.includes(source)) return NextResponse.json({ error: 'source must be hub, ir, sort or tnl' }, { status: 400 });

  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const range = resolveRange(from || to ? { key: 'custom', from, to } : { key: searchParams.get('range') || 'all' });
  const rb = rangeBounds(range);

  const sb = supabaseAdmin();
  let rows, hubs;
  try {
    const pats = opsKamPatterns(user);
    if (pats && pats.length === 0) rows = [];
    else rows = await fetchAll(() => {
      let q = sb.from('ops_issues').select(COLS).not('kam_name', 'is', null);
      if (pats) q = q.or(pats.map((p) => `kam_name.ilike.${p}`).join(','));
      return q.order('issue_id');
    });
    hubs = await fetchAll(() => sb.from('hub_master').select('hub_name,zone').order('hub_name'));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const issues = withOpsSource(visibleOpsIssues(user, withHubZone(rows, hubs)), sourceIds())
    .filter((i) => i.source === source)
    .filter((i) => {
      if (!rb) return true;
      const t = Date.parse(i.raised_at);
      if (Number.isNaN(t)) return false;
      return (rb.start == null || t >= rb.start) && (rb.end == null || t < rb.end);
    });

  const now = new Date();
  return NextResponse.json({
    ...buildOpsSourceAnalytics(issues, { source, now, range }),
    range: { key: range.key, from: range.from || '', to: range.to || '' },
    generated_at: now.toISOString(),
  });
}
