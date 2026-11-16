import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

// Finishes Google sign-in. Supabase redirects here with ?code=… after Google login.
// Only emails active in users_roles may keep the session (same rule as email sign-up).
function safeNext(v) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

export async function GET(req) {
  const url = new URL(req.url);
  // Public origin from the proxy headers (Vercel and the preview proxy), else the request URL.
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const origin = `${proto}://${host}`;
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  const back = (path) => NextResponse.redirect(new URL(path, origin));
  if (!code) return back('/login?error=oauth');

  const store = await cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return back('/login?error=oauth');

  const { data: { user } } = await sb.auth.getUser();
  const email = (user?.email || '').toLowerCase();
  const { data: row } = email
    ? await supabaseAdmin().from('users_roles').select('email').eq('email', email).eq('is_active', true).maybeSingle()
    : { data: null };
  if (!row) {
    await sb.auth.signOut();
    return back('/login?error=not-listed');
  }
  return NextResponse.redirect(new URL(next, origin));
}
