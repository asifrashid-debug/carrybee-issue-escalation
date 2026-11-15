import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
export const dynamic = 'force-dynamic';

// GET: the signed-in user's latest notifications and unread count.
export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const [{ data, error }, { count }] = await Promise.all([
    sb.from('notifications').select('id, issue_id, kind, title, body, created_at, read_at').eq('recipient_email', session.email).order('created_at', { ascending: false }).limit(30),
    sb.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_email', session.email).is('read_at', null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [], unread: count || 0 });
}

// POST { ids?: number[], all?: boolean } marks notifications as read (only the signed-in user's own).
export async function POST(req) {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();
  let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_email', session.email).is('read_at', null);
  if (!body.all) {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isFinite).slice(0, 100);
    if (!ids.length) return NextResponse.json({ ok: true, updated: 0 });
    q = q.in('id', ids);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
