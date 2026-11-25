import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireUser, requireRole } from '../../../../lib/session';
import { gmailEnvStatus, sameMailbox, hasReadonlyScope, describeGoogleError } from '../../../../lib/gmailCheck.mjs';

export const dynamic = 'force-dynamic';

// GET /api/admin/gmail-check (super admin only)
// Refreshes the Gmail token once, reads the mailbox address and the token's scopes, and reports the result.
// Reads only. The token itself is never returned.
export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const denied = requireRole(auth.user, ['admin']); if (denied) return denied;

  const env = gmailEnvStatus();
  if (env.missing.length) {
    return NextResponse.json({ ok: false, step: 'config', env, error: `Missing in Vercel: ${env.missing.join(', ')}` });
  }

  const client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN });

  let accessToken;
  try {
    const t = await client.getAccessToken();
    accessToken = t?.token;
    if (!accessToken) throw new Error('Google returned no access token.');
  } catch (e) {
    return NextResponse.json({ ok: false, step: 'refresh', env, ...describeGoogleError(e) });
  }

  let scopes = '';
  try {
    const info = await client.getTokenInfo(accessToken);
    scopes = info.scopes ? info.scopes.join(' ') : (info.scope || '');
  } catch (e) {
    return NextResponse.json({ ok: false, step: 'token_info', env, ...describeGoogleError(e) });
  }

  let mailbox = null;
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    mailbox = profile.data.emailAddress || null;
  } catch (e) {
    return NextResponse.json({ ok: false, step: 'profile', env, scopes_readonly: hasReadonlyScope(scopes), ...describeGoogleError(e) });
  }

  const readonly = hasReadonlyScope(scopes);
  const matches = sameMailbox(mailbox, process.env.GMAIL_USER);
  return NextResponse.json({
    ok: readonly && matches,
    step: 'done',
    env,
    mailbox,
    gmail_user_setting_matches: matches,
    scopes_readonly: readonly,
    error: !readonly ? 'The token does not include gmail.readonly. Mint it again with that scope only.'
      : !matches ? 'The token belongs to a different account than GMAIL_USER. Mint it again while signed in as GMAIL_USER.'
      : null,
  });
}
