import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { pickWriteBlock, pickJustifyDueFrom, PICK_JUSTIFICATION_LIMIT } from '../../../../../lib/pickSla';
export const dynamic = 'force-dynamic';

// POST { justification } — a CM member explains a missed or late pick. Asked twice; each has a 24h window.
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const body = await req.json().catch(() => ({}));
  const text = String(body.justification || '').trim();
  if (text.length < 20) return NextResponse.json({ error: 'Justification must be at least 20 characters.' }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: esc } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const block = pickWriteBlock(session, esc, new Date());
  if (block) return NextResponse.json({ error: block.error }, { status: block.status });
  const round = (esc.pick_justifications || 0) + 1;
  if (round > PICK_JUSTIFICATION_LIMIT) return NextResponse.json({ error: 'Justification limit reached.' }, { status: 409 });
  const now = new Date();
  const nextDue = round < PICK_JUSTIFICATION_LIMIT ? pickJustifyDueFrom(now) : null;
  const { error: insErr } = await sb.from('pick_justifications').insert({ issue_id: params.id, round, justification: text, submitted_by: session.email, submitted_at: now.toISOString() });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  const { error: upErr } = await sb.from('escalations').update({ pick_justifications: round, pick_justify_due_at: nextDue }).eq('issue_id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  await sb.from('audit_log').insert({ issue_id: params.id, field_name: `pick_justification_${round}`, old_value: null, new_value: text.slice(0, 500), actor_email: session.email, source: 'tracker' });
  return NextResponse.json({ ok: true, round, due_at: nextDue });
}
