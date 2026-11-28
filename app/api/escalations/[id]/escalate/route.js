import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { loadScope, isVisible } from '../../../../../lib/visibility';
import { escalateTeam, escalateError, escalateFields, escalatedLabel } from '../../../../../lib/escalateTo.mjs';
import { queueIrSync, queueRouteSync } from '../../../../../lib/escalationSync';

export const dynamic = 'force-dynamic';

// POST /api/escalations/[id]/escalate  body: { team: 'ir' | 'central_sort' | 'tnl', mail_subject?: string }
// Escalates one issue to a team. Writes the team's sheet directly (same writers as the escalation form).
// The hub row is not changed yet: the hub marking column has not been chosen.
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const issueId = String(params.id || '').trim();
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Request is not valid.' }, { status: 400 }); }

  const team = escalateTeam(body?.team);
  const err = escalateError(team, body?.mail_subject);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const { data: cur, error: readErr } = await sb.from('escalations').select('*').eq('issue_id', issueId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  // Same visibility as the tracker: an issue the viewer cannot see is "not found".
  if (!cur || !isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (cur.escalated_to) return NextResponse.json({ error: `Already escalated to ${escalatedLabel(cur.escalated_to)}.` }, { status: 409 });

  // Guarded update: only one request can take an issue that is not yet escalated.
  const { data: esc, error: upErr } = await sb.from('escalations')
    .update(escalateFields(team, body.mail_subject, session.email))
    .eq('issue_id', issueId).is('escalated_to', null)
    .select('*').maybeSingle();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  if (!esc) return NextResponse.json({ error: 'This issue was just escalated by someone else.' }, { status: 409 });

  await sb.from('audit_log').insert({ issue_id: issueId, field_name: 'escalated_to', old_value: null, new_value: team.label, actor_email: session.email, source: 'tracker' });

  const written = team.key === 'ir' ? await queueIrSync(sb, esc) : await queueRouteSync(sb, esc, team.key);

  return NextResponse.json({
    ok: true,
    issue_id: issueId,
    escalated_to: esc.escalated_to,
    escalated_at: esc.escalated_at,
    escalated_by: esc.escalated_by,
    sheet_written: written,
    warning: written ? null : `Escalated to ${team.label}, but the ${team.label} sheet write failed. It is logged in Sync Health.`,
  });
}
