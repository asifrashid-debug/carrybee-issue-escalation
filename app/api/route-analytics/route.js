import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { loadScope, scopeFilter } from '../../../lib/visibility';
import { resolveRange, rangeBounds } from '../../../lib/dateRange';
import { routeListFilter } from '../../../lib/irEscalation.mjs';
import { buildRouteAnalytics, ROUTE_SHEET_ROW } from '../../../lib/routeAnalytics.mjs';
import { indexCategories } from '../../../lib/categorySla.js';

export const dynamic = 'force-dynamic';

const COLUMNS = 'issue_id, email, zone, concern_hub, issue_category, issue_sub_category, submitted_at, issue_status, ops_issue_status, ops_status, validation, route_central_sort, route_tnl, central_sort_sheet_row, tnl_sheet_row';
const PAGE = 1000;

// GET /api/route-analytics?route=central_sort|tnl&range=7d&zone=ISD  (or &from=YYYY-MM-DD&to=YYYY-MM-DD)
// Analytics over every issue ticked for the route that the viewer may see (same visibility and date rules as the list).
// Reads all matching rows in pages, so counts are not capped at the list page size.
export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const { searchParams } = new URL(req.url);
  const route = searchParams.get('route');
  if (!ROUTE_SHEET_ROW[route]) return NextResponse.json({ error: 'route must be central_sort or tnl' }, { status: 400 });

  const sb = supabaseAdmin();
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const range = resolveRange(from || to ? { key: 'custom', from, to } : { key: searchParams.get('range') || 'all' });
  const rb = rangeBounds(range);
  const listRoute = routeListFilter(route);
  const scope = await loadScope(sb, session);
  const zone = searchParams.get('zone');

  const rows = [];
  try {
    for (let start = 0; ; start += PAGE) {
      let q = sb.from('escalations').select(COLUMNS).order('issue_id', { ascending: true }).range(start, start + PAGE - 1);
      q = q.eq(listRoute.column, listRoute.value);
      if (rb?.start != null) q = q.gte('submitted_at', new Date(rb.start).toISOString());
      if (rb?.end != null) q = q.lt('submitted_at', new Date(rb.end).toISOString());
      if (zone) q = q.eq('zone', zone);
      if (!scope.all) q = q.or(scopeFilter(scope));
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }

  // Category SLA targets, same source and filter as the list (category_master, requester side, active rows)
  const { data: cats } = await sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true);
  const now = new Date();
  return NextResponse.json({
    ...buildRouteAnalytics(rows, { route, now, range, catIndex: indexCategories(cats || []) }),
    range: { key: range.key, from: range.from || '', to: range.to || '' },
    zone: zone || null,
    generated_at: now.toISOString(),
  });
}
