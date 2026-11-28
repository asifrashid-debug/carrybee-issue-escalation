import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { canOpenTab } from '../../../lib/access';
import { visibleOpsIssues, canEditKamFeedback, withHubZone, opsKamPatterns, withOpsSource } from '../../../lib/opsIssues.mjs';
import { fetchAll, sourceIds } from '../../../lib/opsIssueSync';
import { listView, listCounts, raisedRefs } from '../../../lib/opsListView.mjs';
export const dynamic = 'force-dynamic';

const COLS = 'sheet_spreadsheet_id,issue_id,consignment_id,merchant_name,issue_category,issue_sub_category,hub_feedback,hub_name,kam_name,issue_status,validation,kam_feedback,updated_at,raised_at,pick_due_at,picked_at,picked_by,in_progress_at,resolve_due_at,closed_at,closed_by,validated_at,validated_by';

// The viewer's visible rows are cached for a short time, so the list, its filters and the header badge do not each read the whole table.
// Per server instance only. The 20-second window is the longest a change can show late.
const CACHE_MS = 20000;
const CACHE_MAX_VIEWERS = 200;
const cache = new Map();

// The Ops Issues the viewer may see, with zone and source. The visibility rule is applied here, in full.
async function visibleRows(user) {
  const sb = supabaseAdmin();
  const pats = opsKamPatterns(user);
  let rows;
  if (pats && pats.length === 0) rows = [];
  else rows = await fetchAll(() => {
    let q = sb.from('ops_issues').select(COLS).not('kam_name', 'is', null);
    if (pats) q = q.or(pats.map((p) => `kam_name.ilike.${p}`).join(','));
    return q.order('issue_id');
  });
  // Zone comes from hub_master (not stored on ops_issues). Inactive hubs are included so older issues keep their zone.
  const hubs = await fetchAll(() => sb.from('hub_master').select('hub_name,zone').order('hub_name'));
  return withOpsSource(visibleOpsIssues(user, withHubZone(rows, hubs)), sourceIds());
}

// GET /api/ops-issues?source=all|hub|ir|sort|tnl&filter=all|pick|open|closed|overdue&q=...&sort=newest|oldest&size=100
// Returns one page of the viewer's issues, the counts for every tab, and the Raised references for the badges.
export async function GET(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!canOpenTab(user.role, 'kam_issues')) return NextResponse.json({ error: 'Your role cannot open this tab' }, { status: 403 });

  const key = String(user.email || '').toLowerCase();
  let rows;
  try {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      rows = hit.rows;
    } else {
      rows = await visibleRows(user);
      if (cache.size >= CACHE_MAX_VIEWERS) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), rows });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const view = listView(rows, {
    source: searchParams.get('source') || 'all',
    filter: searchParams.get('filter') || 'all',
    q: String(searchParams.get('q') || '').slice(0, 200),
    sort: searchParams.get('sort') || 'newest',
    size: searchParams.get('size'),
  }, now);
  const issues = view.issues.map((i) => ({ ...i, can_edit: canEditKamFeedback(user, i) }));
  return NextResponse.json({
    issues,
    total: view.total,
    counts: listCounts(rows, now),
    raised: raisedRefs(rows),
    viewer: user.email,
    generated_at: now.toISOString(),
  });
}
