import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser, requireRole } from '../../../../lib/session';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const denied = requireRole(session, ['admin']); if (denied) return denied;
  const sb = supabaseAdmin();
  const { data: logs } = await sb.from('sync_log').select('*').order('created_at', { ascending: false }).limit(100);
  const queued = (logs||[]).filter(l=>l.status==='queued'||l.status==='failed').length;
  const lastSuccess = (logs||[]).find(l=>l.status==='success');
  return NextResponse.json({ queue_depth: queued, last_success: lastSuccess||null, recent: logs||[] });
}
