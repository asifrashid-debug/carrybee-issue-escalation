import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/session';
import { lookupBusiness } from '../../../../lib/business';
export const dynamic = 'force-dynamic';

// GET /api/business/lookup?q=<business id or name> — used by the MX form to fill the business name and KAM.
export async function GET(req) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const q = new URL(req.url).searchParams.get('q') || '';
  if (q.length > 200) return NextResponse.json({ error: 'Query too long' }, { status: 400 });
  try {
    return NextResponse.json(await lookupBusiness(supabaseAdmin(), q));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
