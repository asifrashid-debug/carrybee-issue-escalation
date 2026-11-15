import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { loadScope, isVisible } from '../../../lib/visibility';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  let q = sb.from('escalations').select('*').order('created_at', { ascending: false }).limit(5000);
  const eq = (k,col)=>{ const v=searchParams.get(k); if(v) q=q.eq(col,v); };
  eq('zone','zone'); eq('channel','channel'); eq('issue_status','issue_status'); eq('ops_issue_status','ops_issue_status');
  const { data: all } = await q;
  const scope = await loadScope(sb, session);
  const data = (all || []).filter((r) => isVisible(scope, r)); // same visibility as the tracker
  const cols = ['issue_id','submitted_at','email','consignment_id','merchant_name','channel','zone','concern_hub','issue_status','issue_category','issue_sub_category','issue_details','kam_name','week','priority_scale','kam_feedback_status','layer1_response','layer2_response','layer3_response','issue_pick_time','ops_issue_status','remarks','regional_lead','issue_response_datetime','division','ops_status','validation','ops_category'];
  const csv = [cols.join(','), ...(data||[]).map(r=>cols.map(c=>`"${String(r[c]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=escalations.csv' } });
}
