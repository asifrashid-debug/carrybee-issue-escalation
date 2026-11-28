import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { loadScope, isVisible } from '../../../../../lib/visibility';
import { escalateTeam, isOnTeamSheet } from '../../../../../lib/escalateTo.mjs';
import { queueIrSync, queueRouteSync } from '../../../../../lib/escalationSync';

export const dynamic = 'force-dynamic';

// POST /api/escalations/[id]/retry-sheet
// Writes an escalated issue to its team's sheet again, after the first write failed.
// Writes nothing when the issue is already on the sheet (409). Same visibility as the tracker.
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const issueId = String(params.id || '').trim();

  const { data: cur, error: readErr } = await sb.from('escalations').select('*').eq('issue_id', issueId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!cur || !isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const team = escalateTeam(cur.escalated_to);
  if (!team) return NextResponse.json({ error: 'This issue is not escalated.' }, { status: 400 });
  if (isOnTeamSheet(cur)) return NextResponse.json({ error: `Already on the ${team.label} sheet.` }, { status: 409 });

  await sb.from('audit_log').insert({ issue_id: issueId, field_name: 'escalation_sheet_retry', old_value: null, new_value: team.label, actor_email: session.email, source: 'tracker' });

  const written = team.key === 'ir' ? await queueIrSync(sb, cur) : await queueRouteSync(sb, cur, team.key);

  return NextResponse.json({
    ok: true,
    issue_id: issueId,
    sheet_written: written,
    warning: written ? null : `The ${team.label} sheet write failed again. It is logged in Sync Health.`,
  });
}
