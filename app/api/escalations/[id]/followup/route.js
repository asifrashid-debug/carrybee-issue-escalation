import { NextResponse } from 'next/server';
import { requireUser } from '../../../../../lib/session';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { followupPlan } from '../../../../../lib/sla';
import { canEditOps } from '../../../../../lib/roles';
import { loadScope, isVisible } from '../../../../../lib/visibility';
export const dynamic = 'force-dynamic';

// GET: current follow-up plan for an issue (KAM + CM levels, due times, status).
export async function GET(_req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const [{ data: esc }, { data: fus }] = await Promise.all([
    sb.from('escalations').select('*').eq('issue_id', params.id).single(),
    sb.from('followups').select('level, done_at, actor_email').eq('issue_id', params.id),
  ]);
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), esc)) return NextResponse.json({ error: 'Not found' }, { status: 404 }); // not visible to this viewer
  return NextResponse.json({ plan: followupPlan(esc, fus || []), followups: fus || [] });
}

// POST { level: 0 | 1 | 2 | 3, actor_email }  (0 = KAM followup, 1..3 = CM followups)
export async function POST(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const body = await req.json().catch(() => ({}));
  const level = Number(body.level);
  const actor = session.email;
  if (![0, 1, 2, 3].includes(level)) return NextResponse.json({ error: 'level must be 0, 1, 2 or 3' }, { status: 400 });
  if (!actor) return NextResponse.json({ error: 'actor_email is required' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: esc } = await sb.from('escalations').select('*').eq('issue_id', params.id).single();
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), esc)) return NextResponse.json({ error: 'Not found' }, { status: 404 }); // not visible to this viewer
  const [{ data: fus }, { data: user }, { data: requester }] = await Promise.all([
    sb.from('followups').select('level, done_at, actor_email').eq('issue_id', params.id),
    sb.from('users_roles').select('email, role, teams, zone, region').eq('email', actor).eq('is_active', true).maybeSingle(),
    sb.from('users_roles').select('email, role, teams').eq('email', esc.email).eq('is_active', true).maybeSingle(),
  ]);
  if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!user) return NextResponse.json({ error: 'Unknown or inactive user' }, { status: 403 });

  // Who may act: KAM followup = the raiser (or admin); CM followups = ops roles that can edit this issue.
  const isRaiser = esc.email === actor;
  const allowed = level === 0 ? (isRaiser || user.role === 'admin') : (canEditOps(user, esc, requester) || user.role === 'admin');
  if (!allowed) return NextResponse.json({ error: 'Your role cannot record this follow-up' }, { status: 403 });

  const plan = followupPlan(esc, fus || []);
  const target = level === 0 ? plan.kam : plan.cm[level - 1];
  if (target.done) return NextResponse.json({ error: 'This follow-up is already recorded' }, { status: 409 });
  if (level === 0 && !plan.kam.available) return NextResponse.json({ error: plan.kam.hiddenReason || 'KAM followup not available' }, { status: 409 });
  if (level > 0 && !target.unlocked) return NextResponse.json({ error: target.status === 'locked' ? 'Unlocks after Pick' : 'Complete the previous follow-up first' }, { status: 409 });

  const now = new Date().toISOString();
  const { error } = await sb.from('followups').insert({ issue_id: params.id, level, actor_email: actor, done_at: now, note: body.note || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert({ issue_id: params.id, field_name: level === 0 ? 'kam_followup' : `cm_followup_${level}`, old_value: null, new_value: now, actor_email: actor, source: 'tracker' });

  const { data: fus2 } = await sb.from('followups').select('level, done_at, actor_email').eq('issue_id', params.id);
  return NextResponse.json({ ok: true, plan: followupPlan(esc, fus2 || []) });
}
