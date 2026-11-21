import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { canOpenTab, tabForPath, tabsFor } from './lib/access';

// Everything except the sign-in page, auth endpoints, the sheet webhook (secret-checked) and static assets needs a session.
const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/webhook/sheet', '/api/import/legacy', '/_next/', '/carrybee-logo.png', '/logo-light.png', '/logo-dark.png', '/favicon.ico', '/manifest.webmanifest', '/sw.js', '/icons/'];
// Signed-in users of any role may call these (the header reads /api/me to build the nav).
const ANY_ROLE_API = ['/api/me'];

// Role of the signed-in user, from users_roles (active rows). Server-side only.
// Cached per instance for 60 seconds, so every request does not make a database call. A role change or
// deactivation can take up to 60 seconds to apply.
const ROLE_TTL = 60000;
const roleCache = new Map();
async function roleFor(email) {
  const hit = roleCache.get(email);
  if (hit && Date.now() - hit.at < ROLE_TTL) return hit.role;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users_roles?select=role&is_active=eq.true&email=eq.${encodeURIComponent(email)}`;
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' });
  if (!r.ok) return null;
  const rows = await r.json();
  const role = rows?.[0]?.role || null;
  if (roleCache.size > 500) roleCache.clear();
  roleCache.set(email, { role, at: Date.now() });
  return role;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  // Static files need no session check: skip the auth call for them.
  if (pathname.startsWith('/icons/') || ['/favicon.ico', '/manifest.webmanifest', '/sw.js', '/carrybee-logo.png', '/logo-light.png', '/logo-dark.png'].includes(pathname)) return NextResponse.next();
  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => {
        req.cookies.set(name, value);
        res.cookies.set(name, value, options);
      }),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return res;
  if (!user) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    login.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  const role = await roleFor((user.email || '').toLowerCase());

  // API guard: a signed-in user must have a role with at least one tab. Routes also check ownership and visibility.
  if (pathname.startsWith('/api/')) {
    if (ANY_ROLE_API.includes(pathname)) return res;
    if (!role || tabsFor(role).length === 0) return NextResponse.json({ error: 'Your role cannot use the tracker' }, { status: 403 });
    return res;
  }

  // Page guard. Roles with no tabs (management, regional_lead, hub_ops) land on /no-access, not '/' (that would loop).
  if (pathname === '/no-access') return res;
  if (!role) return NextResponse.redirect(new URL('/login', req.url));
  if (tabsFor(role).length === 0) return NextResponse.redirect(new URL('/no-access', req.url));
  const tab = tabForPath(pathname);
  if (tab && !canOpenTab(role, tab)) return NextResponse.redirect(new URL('/', req.url));
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
