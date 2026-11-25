import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/session';
import { loadScope, scopeFilter } from '../../../../lib/visibility';
import { resolveRange, rangeBounds } from '../../../../lib/dateRange';
import { routeListFilter } from '../../../../lib/irEscalation.mjs';
import { buildIrAnalytics } from '../../../../lib/irAnalytics.mjs';

export const dynamic = 'force-dynamic';

const COLUMNS = 'issue_id, email, zone, concern_hub, issue_category, submitted_at, ir_status, ir_kam_status, ir_assigned_member, ir_picked_at, ir_resolved_at, ir_resolve_sla_days';
const PAGE = 1000;

// GET /api/ir/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD | ?range=7d&zone=ISD
// IR analytics over every IR issue the viewer may see (same visibility and date rules as the IR list).
// Reads all matching rows in pages, so counts are not capped at the list page size.
export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const range = resolveRange(from || to ? { key: 'custom', from, to } : { key: searchParams.get('range') || 'all' });
  const rb = rangeBounds(range);
  const listRoute = routeListFilter('ir');
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

  const now = new Date();
  return NextResponse.json({
    ...buildIrAnalytics(rows, { now, range }),
    range: { key: range.key, from: range.from || '', to: range.to || '' },
    zone: zone || null,
    generated_at: now.toISOString(),
  });
}
