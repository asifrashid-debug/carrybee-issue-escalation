import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseAnon() {
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
  return createClient(url, anon);
}
export function supabaseAdmin() {
  if (!url || !service) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, service, { auth: { persistSession: false } });
}
