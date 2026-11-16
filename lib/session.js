import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Server-side session from the Supabase auth cookie. The signed-in email is the only identity the API trusts.
// Role, teams, zone and region come from users_roles (active rows only). Returns null when not signed in or not listed.
export async function getSessionUser() {
  const store = await cookies(); // Next 15+: cookies() returns a Promise; awaiting it is required
  const sb = createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: () => {}, // route handlers cannot set cookies here; middleware refreshes the session
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const { data: row } = await supabaseAdmin()
    .from('users_roles')
    .select('email, role, teams, zone, region, display_name, is_active')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle();
  if (!row) return null;
  return { ...row, email };
}

// Use at the top of every protected route. Returns { user } or { response } to return immediately.
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) };
  return { user };
}

export function requireRole(user, roles) {
  if (!user || !roles.includes(user.role)) return NextResponse.json({ error: 'Your role cannot do this' }, { status: 403 });
  return null;
}
