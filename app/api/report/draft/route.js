import { NextResponse } from 'next/server';
import { requireUser, requireRole } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabase';
import { loadReportData } from '../../../../lib/reportData';
import { buildDailyReport, buildMessages, recipientPlan } from '../../../../lib/dailyReport';

// Super admin only. Builds the report exactly as it will be sent, without sending anything.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;
  try {
    const now = new Date();
    const data = await loadReportData(supabaseAdmin());
    const report = buildDailyReport({ ...data, now });
    const messages = buildMessages(report, data.users, { appUrl: process.env.NEXT_PUBLIC_APP_URL || '' });
    const admin = messages.find((m) => m.to === auth.user.email) || messages[0];
    return NextResponse.json({
      asOf: now.toISOString(),
      subject: admin?.subject || '',
      html: admin?.html || '',
      text: admin?.text || '',
      recipients: recipientPlan(data.users).map((r) => ({ email: r.email, name: r.name, scope: r.scope, teams: r.teams || null })),
      portfolio: report.portfolio,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
