import { NextResponse } from 'next/server';
import { runOpsIssueSync } from '../../../../lib/opsIssueSync';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ops Issues sync job. Vercel cron sends "Authorization: Bearer $CRON_SECRET". ?dry=1 reports without writing.
// No schedule is set in vercel.json yet (needs the deploy approval).
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  try {
    const report = await runOpsIssueSync({ dryRun });
    return NextResponse.json(report, { status: report.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
