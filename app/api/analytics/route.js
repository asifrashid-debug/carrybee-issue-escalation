import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { computeAnalytics } from '../../../lib/analytics';
import { teamPerformanceView } from '../../../lib/teamScope';
import { requireUser } from '../../../lib/session';
import { loadScope, isVisible } from '../../../lib/visibility';
import { resolveRange, rangeBounds, rangeDays } from '../../../lib/dateRange';
import { fetchAllEscalations } from '../../../lib/escalationsPaging';
import { fetchAll } from '../../../lib/opsIssueSync';
import { computeOpsKam, forViewer } from '../../../lib/opsKamAnalytics.mjs';

export const dynamic = 'force-dynamic';

// Ops-KAM (Ops Issues) columns for the Ops-KAM section. The lifecycle columns need migration 021.
const OPS_KAM_VIEWERS = ['admin', 'team_lead', 'cm_lead'];
const OPS_COLS = 'issue_id,kam_name,issue_category,issue_status,validation,validated_at,raised_at,pick_due_at,picked_at,resolve_due_at,closed_at,sheet_spreadsheet_id';

const COLS = 'issue_id,cm_assigned,submitted_at,email,channel,zone,concern_hub,division,regional_lead,issue_status,kam_feedback_status,issue_category,issue_sub_category,priority_scale,issue_pick_time,issue_response_datetime,ops_issue_status,is_archived,updated_at';

// Only the rows inside the chosen date range are read: the route filters to that range anyway (below), and so do
// the Ops-KAM numbers. The read is padded by one day each side, so it can only be looser than the exact filter.
// The list is the same for every viewer (visibility is applied per request), so each window is kept for 30 seconds
// per instance, and at most ESC_CACHE_MAX windows are kept, instead of paging the whole table on every poll.
const ESC_TTL = 30000;
const ESC_CACHE_MAX = 8;
const DAY_MS = 86400000;
const escCache = new Map(); // window key -> { at, rows }

async function readEscalations(sb, win, key) {
  const hit = escCache.get(key);
  if (hit && Date.now() - hit.at < ESC_TTL) return { rows: hit.rows };
  // Pages are requested in parallel after the first page (see lib/escalationsPaging.js).
  const paged = await fetchAllEscalations(sb, COLS, win);
  if (paged.error) return { error: paged.error };
  for (const [k, v] of escCache) if (Date.now() - v.at >= ESC_TTL) escCache.delete(k);
  if (!escCache.has(key) && escCache.size >= ESC_CACHE_MAX) escCache.delete(escCache.keys().next().value);
  escCache.set(key, { at: Date.now(), rows: paged.rows });
  return { rows: paged.rows };
}

export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const now = new Date();
  try {
    const sb = supabaseAdmin();
    // Date range from the calendar (Dhaka days). The trend and ageing end at the range end, or now.
    const qs = new URL(req.url).searchParams;
    const range = resolveRange({ key: 'custom', from: qs.get('from'), to: qs.get('to') });
    const rb = rangeBounds(range);
    const win = rb ? { start: rb.start != null ? rb.start - DAY_MS : null, end: rb.end != null ? rb.end + DAY_MS : null } : null;
    const winKey = rb ? `${rb.start ?? ''}|${rb.end ?? ''}` : 'all';
    const esc = await readEscalations(sb, win, winKey);
    if (esc.error) return NextResponse.json({ error: esc.error }, { status: 500 });
    const escalations = esc.rows;
    const [{ data: users, error: uErr }, { data: hubs, error: hErr }, { data: cats, error: cErr }] = await Promise.all([
      sb.from('users_roles').select('email, display_name, role, teams').eq('is_active', true),
      sb.from('hub_master').select('hub_name, zone, division, regional_lead, cluster_lead').eq('is_active', true),
      sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true),
    ]);
    if (uErr || hErr || cErr) return NextResponse.json({ error: (uErr || hErr || cErr).message }, { status: 500 });
    // Team Performance and HUB Performance show only the issues this viewer can see (same rules as the tracker)
    const scope = await loadScope(sb, session);
    const visible = escalations.filter((e) => isVisible(scope, e));
    const inRange = rb ? visible.filter((e) => { const t = Date.parse(e.submitted_at); return (rb.start == null || t >= rb.start) && (rb.end == null || t < rb.end); }) : visible;
    const calcNow = rb?.end != null ? new Date(Math.min(now.getTime(), rb.end)) : now;
    const days = rangeDays(range, calcNow.getTime());
    // Team Performance (?view=teams): each role sees only its own teams / own figures (lib/teamScope.js)
    if (new URL(req.url).searchParams.get('view') === 'teams') {
      return NextResponse.json({ mode: 'live', ...teamPerformanceView({ session, users: users || [], escalations: inRange, hubs: hubs || [], categories: cats || [], now: calcNow }) });
    }
    const result = computeAnalytics({ escalations: inRange, users: users || [], hubs: hubs || [], categories: cats || [], now: calcNow, days });
    // Ops-KAM section. Its own try block: if the Ops Issues query fails, the escalation analytics still load.
    // Everyone who can open Analytics (admin, team_lead, cm_lead). Aggregates only; per-KAM table is admin-only (forViewer).
    let opsKam;
    if (!OPS_KAM_VIEWERS.includes(session.role)) {
      opsKam = undefined;
    } else try {
      const issues = await fetchAll(() => {
        let q = sb.from('ops_issues').select(OPS_COLS).not('raised_at', 'is', null);
        if (win?.start != null) q = q.gte('raised_at', new Date(win.start).toISOString());
        if (win?.end != null) q = q.lt('raised_at', new Date(win.end).toISOString());
        return q.order('issue_id');
      });
      const inOpsRange = rb ? issues.filter((i) => { const t = Date.parse(i.raised_at); return (rb.start == null || t >= rb.start) && (rb.end == null || t < rb.end); }) : issues;
      const sheetZone = new Map([[process.env.SHEET_ISD, 'ISD'], [process.env.SHEET_OSD, 'OSD'], [process.env.SHEET_CTG, 'CTG']].filter(([id]) => id));
      opsKam = forViewer(computeOpsKam({ issues: inOpsRange, now: calcNow, days, zoneOf: (sid) => sheetZone.get(sid) || null }), session.role);
    } catch (e) {
      opsKam = { error: e.message };
    }
    // Team leads and CM leads see only their own team(s) in Team Performance (members and admin keep the full list)
    if (['team_lead', 'cm_lead'].includes(session.role)) {
      const mine = new Set(session.teams || []);
      result.teams = result.teams.filter((t) => mine.has(t.team));
    }
    return NextResponse.json({ mode: 'live', ...result, opsKam });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
