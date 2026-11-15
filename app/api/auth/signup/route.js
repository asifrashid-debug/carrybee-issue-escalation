import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';

// Self sign-up is allowed only for emails already active in users_roles. Anyone else is refused before any account is created.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: row } = await sb.from('users_roles').select('email').eq('email', email).eq('is_active', true).maybeSingle();
  if (!row) return NextResponse.json({ error: 'This email is not on the CarryBee access list. Ask an admin to add you.' }, { status: 403 });
  const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message || '');
    return NextResponse.json({ error: exists ? 'An account already exists for this email. Sign in instead.' : error.message }, { status: exists ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
