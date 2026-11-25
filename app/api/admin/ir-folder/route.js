import { NextResponse } from 'next/server';
import { requireUser, requireRole } from '../../../../lib/session';
import { ensureIrFolder } from '../../../../lib/irAttachments';
export const dynamic = 'force-dynamic';

// Super admin only. Creates (or finds) the IR attachments folder with the app's own Drive permission.
// Writes nothing to the database. The admin copies the returned ID into DRIVE_IR_FOLDER_ID in Vercel.
export async function POST() {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;
  try {
    const folder = await ensureIrFolder();
    const configured = process.env.DRIVE_IR_FOLDER_ID || '';
    return NextResponse.json({
      ok: true,
      ...folder,
      configured_in_env: Boolean(configured),
      env_matches: configured === folder.id,
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not create or find the folder: ${e.message}` }, { status: 500 });
  }
}
