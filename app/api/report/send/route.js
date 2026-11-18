import { NextResponse } from 'next/server';
import { requireUser, requireRole } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabase';
import { loadReportData } from '../../../../lib/reportData';
import { buildDailyReport, buildMessages } from '../../../../lib/dailyReport';
import { sendAll, mailerConfigured } from '../../../../lib/mailer';

// Super admin only. Sends the report built as of the draft time the admin reviewed.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

export async function POST(req) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
  const asOf = new Date(body.asOf || 0);
  if (Number.isNaN(asOf.getTime()) || Date.now() - asOf.getTime() > DRAFT_MAX_AGE_MS || asOf.getTime() > Date.now() + 60000) {
    return NextResponse.json({ error: 'This draft is out of date. Close it and open the draft again.' }, { status: 409 });
  }
  if (!mailerConfigured()) return NextResponse.json({ error: 'Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD).' }, { status: 500 });
  try {
    const data = await loadReportData(supabaseAdmin());
    const report = buildDailyReport({ ...data, now: asOf });
    const messages = buildMessages(report, data.users, { appUrl: process.env.NEXT_PUBLIC_APP_URL || '' });
    const results = await sendAll(messages);
    const failed = results.filter((r) => !r.ok);
    console.log(`[daily-report] manual send by ${auth.user.email}: ${results.length - failed.length} sent, ${failed.length} failed`);
    return NextResponse.json({ sent: results.length - failed.length, failed, total: results.length }, { status: failed.length ? 207 : 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
