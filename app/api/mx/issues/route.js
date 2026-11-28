import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { validateMxIssue, requestHash, bearerToken, apiKeyOk } from '../../../../lib/mxApi.mjs';
import { submitMxIssue, issueSummary } from '../../../../lib/mxIntake';

// MX CRM integration. Public path (see middleware.js): the API key is the only check here.
// Full reference: docs/MX-API.md
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

function unauthorized() {
  return NextResponse.json({ error: 'Invalid or missing API key', code: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
}

// POST /api/mx/issues: create one MX issue (always routed to HUB).
export async function POST(req) {
  if (!apiKeyOk(bearerToken(req.headers.get('authorization')), process.env.MX_API_KEY)) return unauthorized();
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body too large (64 KB max)', code: 'too_large' }, { status: 413 });
  let body;
  try { body = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: 'Body must be valid JSON', code: 'bad_json' }, { status: 400 }); }
  const v = validateMxIssue(body);
  if (!v.ok) return NextResponse.json({ error: 'Validation failed', code: 'validation', errors: v.errors }, { status: 400 });
  try {
    const out = await submitMxIssue(v.clean, requestHash(v.clean));
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    return NextResponse.json({ error: 'Could not save the issue. Nothing was saved; retry with the same external_id.', code: 'server_error', detail: String(e.message || e) }, { status: 500 });
  }
}

// GET /api/mx/issues?external_id=...: status of an issue the MX CRM sent. Internal fields are not returned.
export async function GET(req) {
  if (!apiKeyOk(bearerToken(req.headers.get('authorization')), process.env.MX_API_KEY)) return unauthorized();
  const external_id = String(new URL(req.url).searchParams.get('external_id') || '').trim();
  if (!external_id) return NextResponse.json({ error: 'external_id is required', code: 'validation' }, { status: 400 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('mx_api_requests').select('issue_id').eq('external_id', external_id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Lookup failed', code: 'server_error' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No issue with this external_id', code: 'not_found', external_id }, { status: 404 });
  if (!data.issue_id) return NextResponse.json({ external_id, code: 'in_progress', error: 'Still being processed' }, { status: 202 });
  const summary = await issueSummary(sb, data.issue_id);
  if (summary.error) return NextResponse.json({ external_id, ...summary }, { status: 404 });
  return NextResponse.json({ external_id, ...summary });
}
