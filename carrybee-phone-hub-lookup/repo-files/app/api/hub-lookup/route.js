import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { serverHubLookup } from '../../../lib/hubLookupServer';

export const dynamic = 'force-dynamic';

// Hub lookup for the escalation form without a browser extension (phones and any device).
// POST { consignment_id }
// -> { ok, hub, source: 'hive'|'history'|null, history_at, hive_configured, error }
// Tries Hive (when HIVE_API_URL is configured), then the most recent escalation for the same
// Consignment ID. The hub text is untrusted: the client matches it against the active hub list.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const body = await req.json().catch(() => ({}));
  const result = await serverHubLookup(body.consignment_id, { sb: supabaseAdmin(), env: process.env });
  return NextResponse.json({ ok: true, ...result });
}
