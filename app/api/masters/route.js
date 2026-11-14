import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET() {
  const sb = supabaseAdmin();
  const [{ data: hubs }, { data: cats }, { data: users }, { data: cfg }] = await Promise.all([
    sb.from('hub_master').select('*').eq('is_active', true).order('hub_name'),
    sb.from('category_master').select('*').eq('is_active', true).order('category'),
    sb.from('users_roles').select('*').eq('is_active', true).order('email'),
    sb.from('app_config').select('*')
  ]);
  return NextResponse.json({ hubs: hubs||[], categories: cats||[], users: users||[], config: cfg||[] });
}
