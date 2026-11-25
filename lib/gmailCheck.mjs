// Gmail token check (admin page). Pure helpers, tested in tests/gmailCheck.test.mjs.
// The check never returns the token. It returns only status, the mailbox address, scope names and Google's error code.

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// Which settings are present. Values are never returned, only true or false.
export function gmailEnvStatus(env = process.env) {
  const has = (k) => Boolean(String(env[k] || '').trim());
  const status = {
    GOOGLE_OAUTH_CLIENT_ID: has('GOOGLE_OAUTH_CLIENT_ID'),
    GOOGLE_OAUTH_CLIENT_SECRET: has('GOOGLE_OAUTH_CLIENT_SECRET'),
    GMAIL_OAUTH_REFRESH_TOKEN: has('GMAIL_OAUTH_REFRESH_TOKEN'),
    GMAIL_USER: has('GMAIL_USER'),
  };
  status.missing = Object.keys(status).filter((k) => status[k] === false);
  return status;
}

// Same address, ignoring case and surrounding spaces.
export function sameMailbox(a, b) {
  const norm = (v) => String(v || '').trim().toLowerCase();
  return !!norm(a) && norm(a) === norm(b);
}

// Scope list from the token info ("scope" is a space-separated string).
export function hasReadonlyScope(scopeString) {
  return String(scopeString || '').split(/\s+/).includes(GMAIL_READONLY_SCOPE);
}

// Turns a Google auth or API error into fields that are safe to show. Never includes the token.
export function describeGoogleError(e) {
  const data = e?.response?.data || {};
  const code = data.error || e?.code || null;
  const description = data.error_description || e?.message || 'Unknown error';
  return {
    google_error: typeof code === 'string' ? code : null,
    google_error_description: String(description).slice(0, 300),
  };
}
