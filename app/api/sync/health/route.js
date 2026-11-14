import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET() {
  const sb = supabaseAdmin();
  const { data: logs } = await sb.from('sync_log').select('*').order('created_at', { ascending: false }).limit(100);
  const queued = (logs||[]).filter(l=>l.status==='queued'||l.status==='failed').length;
  const lastSuccess = (logs||[]).find(l=>l.status==='success');
  return NextResponse.json({ queue_depth: queued, last_success: lastSuccess||null, recent: logs||[] });
}
