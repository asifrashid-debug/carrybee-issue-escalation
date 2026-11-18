import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { computeAnalytics } from '../../../lib/analytics';
import { teamPerformanceView } from '../../../lib/teamScope';
import { requireUser } from '../../../lib/session';
import { loadScope, isVisible } from '../../../lib/visibility';
import { resolveRange, rangeBounds, rangeDays } from '../../../lib/dateRange';

export const dynamic = 'force-dynamic';

const COLS = 'issue_id,cm_assigned,submitted_at,email,channel,zone,concern_hub,division,regional_lead,issue_status,kam_feedback_status,issue_category,issue_sub_category,priority_scale,issue_pick_time,issue_response_datetime,ops_issue_status,is_archived,updated_at';

// The escalation list is the same for every viewer (visibility is applied per request below), so it is
// read once and reused for 30 seconds per instance instead of paging the whole table on every poll.
const ESC_TTL = 30000;
let escCache = { at: 0, rows: null };

export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const now = new Date();
  try {
    const sb = supabaseAdmin();
    // PostgREST returns max 1000 rows per request; page through all escalations.
    let escalations;
    if (escCache.rows && Date.now() - escCache.at < ESC_TTL) {
      escalations = escCache.rows;
    } else {
      escalations = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('escalations').select(COLS).order('submitted_at', { ascending: false }).range(from, from + 999);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        escalations.push(...data);
        if (data.length < 1000) break;
      }
      escCache = { at: Date.now(), rows: escalations };
    }
    const [{ data: users, error: uErr }, { data: hubs, error: hErr }, { data: cats, error: cErr }] = await Promise.all([
      sb.from('users_roles').select('email, display_name, role, teams').eq('is_active', true),
      sb.from('hub_master').select('hub_name, zone, division, regional_lead, cluster_lead').eq('is_active', true),
      sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true),
    ]);
    if (uErr || hErr || cErr) return NextResponse.json({ error: (uErr || hErr || cErr).message }, { status: 500 });
    // Team Performance and HUB Performance show only the issues this viewer can see (same rules as the tracker)
    const scope = await loadScope(sb, session);
    const visible = escalations.filter((e) => isVisible(scope, e));
    // Date range from the calendar (Dhaka days). The trend and ageing end at the range end, or now.
    const qs = new URL(req.url).searchParams;
    const range = resolveRange({ key: 'custom', from: qs.get('from'), to: qs.get('to') });
    const rb = rangeBounds(range);
    const inRange = rb ? visible.filter((e) => { const t = Date.parse(e.submitted_at); return (rb.start == null || t >= rb.start) && (rb.end == null || t < rb.end); }) : visible;
    const calcNow = rb?.end != null ? new Date(Math.min(now.getTime(), rb.end)) : now;
    const days = rangeDays(range, calcNow.getTime());
    // Team Performance (?view=teams): each role sees only its own teams / own figures (lib/teamScope.js)
    if (new URL(req.url).searchParams.get('view') === 'teams') {
      return NextResponse.json({ mode: 'live', ...teamPerformanceView({ session, users: users || [], escalations: inRange, hubs: hubs || [], categories: cats || [], now: calcNow }) });
    }
    const result = computeAnalytics({ escalations: inRange, users: users || [], hubs: hubs || [], categories: cats || [], now: calcNow, days });
    // Team leads and CM leads see only their own team(s) in Team Performance (members and admin keep the full list)
    if (['team_lead', 'cm_lead'].includes(session.role)) {
      const mine = new Set(session.teams || []);
      result.teams = result.teams.filter((t) => mine.has(t.team));
    }
    return NextResponse.json({ mode: 'live', ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
