// Mint a Google OAuth refresh token for the app's Sheets + Drive access.
// Runs on YOUR machine. Secrets come from env vars and are never printed or sent to chat.
//
// Usage (Node 18+):
//   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/mint-google-refresh-token.mjs
//
// Before running: in Google Cloud Console, open the OAuth client and add this
// Authorized redirect URI (Web application clients only):
//   http://localhost:8787/oauth2callback
// Sign in with the Google account that owns or can edit the Central Sort and TNL sheets.

import http from 'node:http';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = Number(process.env.PORT || 8787);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

// Full Sheets access (not readonly) plus drive.file for the app's own Drive files.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'false',
  state,
}).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }

  const finish = (code, msg) => {
    res.writeHead(code, { 'Content-Type': 'text/plain' }).end(msg);
    setTimeout(() => server.close(() => process.exit(code === 200 ? 0 : 1)), 300);
  };

  if (url.searchParams.get('error')) return finish(400, 'Google returned: ' + url.searchParams.get('error'));
  if (url.searchParams.get('state') !== state) return finish(400, 'State mismatch. Run the script again.');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code'),
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok || !tok.refresh_token) {
      console.error('Token exchange failed:', tok.error || tokenRes.status, tok.error_description || '');
      return finish(500, 'Token exchange failed. See the terminal.');
    }

    // Confirm which scopes were actually granted (never print the token itself).
    const info = await (await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + encodeURIComponent(tok.access_token))).json();
    const granted = (info.scope || '').split(' ');
    const missing = SCOPES.filter((s) => !granted.includes(s));

    console.log('\nGranted scopes:');
    granted.forEach((s) => console.log('  - ' + s));
    if (missing.length) {
      console.log('\nWARNING: missing scopes: ' + missing.join(', ') + '. Do not use this token; run again and tick every permission.');
      return finish(500, 'Missing scopes. See the terminal.');
    }

    console.log('\nNew GOOGLE_OAUTH_REFRESH_TOKEN (copy it into Vercel, then discard this terminal output):\n');
    console.log(tok.refresh_token);
    console.log('\nNext: Vercel > carrybee-escalation-tracker > Settings > Environment Variables.');
    console.log('Update GOOGLE_OAUTH_REFRESH_TOKEN (Production) as Sensitive, then redeploy.');
    finish(200, 'Done. You can close this tab and return to the terminal.');
  } catch (e) {
    console.error('Error:', e.message);
    finish(500, 'Error. See the terminal.');
  }
});

server.listen(PORT, () => {
  console.log('Open this URL in your browser and sign in with the sheet owner account:\n');
  console.log(authUrl + '\n');
  console.log(`Waiting for the callback on ${REDIRECT_URI} ...`);
});
