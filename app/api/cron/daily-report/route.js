import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { buildDailyReport, buildMessages } from '../../../../lib/dailyReport';
import { sendAll, mailerConfigured } from '../../../../lib/mailer';

// Runs at 20:00 Asia/Dhaka (14:00 UTC), set in vercel.json.
// Vercel sends "Authorization: Bearer $CRON_SECRET". ?dry=1 builds the emails without sending.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COLS = 'issue_id,cm_assigned,submitted_at,email,channel,zone,concern_hub,division,regional_lead,issue_status,issue_category,issue_sub_category,priority_scale,issue_pick_time,issue_response_datetime,ops_issue_status,ops_status,is_archived';

async function loadAll(sb) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('escalations').select(COLS).order('submitted_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(`escalations: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  if (!dry && !mailerConfigured()) {
    return NextResponse.json({ error: 'Email not configured (GMAIL_USER / GMAIL_APP_PASSWORD)' }, { status: 500 });
  }
  try {
    const sb = supabaseAdmin();
    const now = new Date();
    const [escalations, usersRes, hubsRes, catsRes] = await Promise.all([
      loadAll(sb),
      sb.from('users_roles').select('email, display_name, role, teams').eq('is_active', true),
      sb.from('hub_master').select('hub_name, zone, division, regional_lead, cluster_lead').eq('is_active', true),
      sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true),
    ]);
    for (const r of [usersRes, hubsRes, catsRes]) if (r.error) throw new Error(r.error.message);

    const report = buildDailyReport({ escalations, users: usersRes.data, hubs: hubsRes.data, categories: catsRes.data, now });
    const messages = buildMessages(report, usersRes.data, { appUrl: process.env.NEXT_PUBLIC_APP_URL || '' });

    if (dry) {
      return NextResponse.json({ dry: true, recipients: messages.map((m) => ({ to: m.to, subject: m.subject })), portfolio: report.portfolio });
    }
    const results = await sendAll(messages);
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ sent: results.length - failed.length, failed, portfolio: report.portfolio, at: now.toISOString() }, { status: failed.length ? 207 : 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
