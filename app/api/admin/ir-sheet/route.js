import { NextResponse } from 'next/server';
import { requireUser, requireRole } from '../../../../lib/session';
import { createIrSheet } from '../../../../lib/irSheetCreate';
export const dynamic = 'force-dynamic';

// Super admin only. Creates a NEW IR sheet with the 18 headers and the Status dropdown.
// Each call makes another sheet, so it needs { "confirm": true } in the body.
// Writes nothing to the database. The admin copies the returned ID into IR_SHEET_ID in Vercel.
export async function POST(request) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ error: 'Send {"confirm": true} to create a new IR sheet.' }, { status: 400 });
  }
  try {
    const sheet = await createIrSheet();
    const configured = process.env.IR_SHEET_ID || '';
    return NextResponse.json({
      ok: true,
      ...sheet,
      configured_in_env: Boolean(configured),
      env_matches: configured === sheet.id,
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not create the IR sheet: ${e.message}` }, { status: 500 });
  }
}
