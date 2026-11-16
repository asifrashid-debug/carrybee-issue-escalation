import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  const [{ data: hubs }, { data: cats }, { data: users }, { data: cfg }] = await Promise.all([
    sb.from('hub_master').select('*').eq('is_active', true).order('hub_name'),
    sb.from('category_master').select('*').eq('is_active', true).order('category'),
    sb.from('users_roles').select('*').eq('is_active', true).order('email'),
    sb.from('app_config').select('*')
  ]);
  // Hubs and categories are needed by the KAM and MX forms, so every signed-in role gets them.
  // The user list and app settings are admin-only.
  const isAdmin = session.role === 'admin';
  return NextResponse.json({ hubs: hubs||[], categories: cats||[], users: isAdmin ? (users||[]) : [], config: isAdmin ? (cfg||[]) : [] });
}
