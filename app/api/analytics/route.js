import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { computeAnalytics } from '../../../lib/analytics';
import { requireUser } from '../../../lib/session';
import { loadScope, isVisible } from '../../../lib/visibility';

export const dynamic = 'force-dynamic';

const COLS = 'issue_id,cm_assigned,submitted_at,email,channel,zone,concern_hub,division,regional_lead,issue_status,issue_category,priority_scale,issue_pick_time,issue_response_datetime,ops_issue_status,is_archived';

export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const now = new Date();
  try {
    const sb = supabaseAdmin();
    // PostgREST returns max 1000 rows per request; page through all escalations.
    const escalations = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('escalations').select(COLS).order('submitted_at', { ascending: false }).range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      escalations.push(...data);
      if (data.length < 1000) break;
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
    const result = computeAnalytics({ escalations: visible, users: users || [], hubs: hubs || [], categories: cats || [], now });
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
