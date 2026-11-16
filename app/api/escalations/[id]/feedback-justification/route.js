import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { feedbackPhase, isFeedbackOwner, windowEndFrom, JUSTIFICATION_LIMIT } from '../../../../../lib/feedback';
export const dynamic = 'force-dynamic';

// POST { justification } — owner explains a missed 24h feedback window. Each one reopens a new 24h window (max 2).
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const body = await req.json().catch(() => ({}));
  const text = String(body.justification || '').trim();
  if (text.length < 20) return NextResponse.json({ error: 'Justification must be at least 20 characters.' }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: esc } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isFeedbackOwner(session, esc)) return NextResponse.json({ error: 'Only the KAM or CM owner of this issue can give a justification.' }, { status: 403 });
  if (feedbackPhase(esc) !== 'justification_due') return NextResponse.json({ error: 'No justification is due for this issue right now.' }, { status: 409 });
  const round = (esc.feedback_justifications || 0) + 1;
  if (round > JUSTIFICATION_LIMIT) return NextResponse.json({ error: 'Justification limit reached.' }, { status: 409 });
  const now = new Date();
  const due = windowEndFrom(now);
  const { error: insErr } = await sb.from('kam_feedback_justifications').insert({ issue_id: params.id, round, justification: text, submitted_by: session.email, submitted_at: now.toISOString() });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  const { error: upErr } = await sb.from('escalations').update({ feedback_justifications: round, feedback_due_at: due }).eq('issue_id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  await sb.from('audit_log').insert({ issue_id: params.id, field_name: `feedback_justification_${round}`, old_value: null, new_value: text.slice(0, 500), actor_email: session.email, source: 'tracker' });
  return NextResponse.json({ ok: true, round, due_at: due });
}
