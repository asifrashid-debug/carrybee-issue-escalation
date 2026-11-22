import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { loadScope, isVisible } from '../../../lib/visibility';
import { readAllPages } from '../../../lib/pagination.mjs';
export const dynamic = 'force-dynamic';

// Largest export. Beyond this the file says so in the X-Export-Truncated header instead of silently cutting rows.
const MAX_ROWS = 50000;
const COLS = ['issue_id','submitted_at','email','consignment_id','merchant_name','channel','zone','concern_hub','issue_status','issue_category','issue_sub_category','issue_details','kam_name','week','priority_scale','kam_feedback_status','layer1_response','layer2_response','layer3_response','issue_pick_time','ops_issue_status','remarks','regional_lead','issue_response_datetime','division','ops_status','validation','ops_category'];

export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  // The same four filters as before (zone, channel, issue status, ops status), applied in the database.
  const FILTERS = ['zone', 'channel', 'issue_status', 'ops_issue_status'];
  const filter = (q) => {
    for (const k of FILTERS) { const v = searchParams.get(k); if (v) q = q.eq(k, v); }
    return q;
  };
  let all, truncated;
  try {
    ({ rows: all, truncated } = await readAllPages((from, to) =>
      filter(sb.from('escalations').select(COLS.join(',')))
        .order('created_at', { ascending: false }).order('issue_id', { ascending: false }).range(from, to),
      { maxRows: MAX_ROWS }));
  } catch (e) {
    return NextResponse.json({ error: 'Export failed: ' + e.message }, { status: 500 });
  }
  const scope = await loadScope(sb, session);
  const data = all.filter((r) => isVisible(scope, r)); // same visibility as the tracker
  const csv = [COLS.join(','), ...data.map((r) => COLS.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const headers = { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=escalations.csv' };
  if (truncated) headers['X-Export-Truncated'] = String(MAX_ROWS);
  return new NextResponse(csv, { headers });
}
