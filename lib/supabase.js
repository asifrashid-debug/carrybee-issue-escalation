import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Next.js 14 caches GET fetch() by default. supabase-js uses fetch, so without this,
// reads (masters, escalations, webhook lookups) can return stale rows after a DB change.
const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: 'no-store' });
const globalOpts = { fetch: noStoreFetch };

export function supabaseAnon() {
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
  return createClient(url, anon, { global: globalOpts });
}
export function supabaseAdmin() {
  if (!url || !service) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, service, { auth: { persistSession: false }, global: globalOpts });
}
