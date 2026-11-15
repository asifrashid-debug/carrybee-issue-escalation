import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/session';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json({ email: user.email, role: user.role, zone: user.zone, region: user.region, teams: user.teams || [], display_name: user.display_name });
}
