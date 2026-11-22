import { NextResponse } from 'next/server';
import { requireUser, requireRole } from '../../../../lib/session';
import { runOpsIssueSync } from '../../../../lib/opsIssueSync';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Admin trigger for the Ops Issues sync. Body: { "dry": true } reports without writing. Zones: optional ["ISD"].
export async function POST(req) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const zones = Array.isArray(body.zones) && body.zones.length ? body.zones : undefined;
  try {
    const report = await runOpsIssueSync({ dryRun: body.dry === true, ...(zones ? { zones } : {}) });
    return NextResponse.json(report, { status: report.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
