// Gmail read access for the IR drawer. Uses its own OAuth refresh token (GMAIL_OAUTH_REFRESH_TOKEN, gmail.readonly),
// minted while signed in as the GMAIL_USER account. The Sheets and Drive token (GOOGLE_OAUTH_REFRESH_TOKEN) is not changed.
import { google } from 'googleapis';
import { filterBySubject, parseMessage, gmailQueryForSubject, MAIL_MAX_MESSAGES, subjectMatches } from './gmailMail.mjs';

export function gmailConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GMAIL_OAUTH_REFRESH_TOKEN);
}

function gmail() {
  if (!gmailConfigured()) throw new Error('Gmail is not set up. Add GMAIL_OAUTH_REFRESH_TOKEN in Vercel (gmail.readonly, signed in as GMAIL_USER).');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

// All messages whose Subject header equals the given subject (exact, ignoring case and extra spaces).
export async function mailsForSubject(subject) {
  const api = gmail();
  const list = await api.users.messages.list({ userId: 'me', q: gmailQueryForSubject(subject), maxResults: 50 });
  const ids = (list.data.messages || []).map((m) => m.id);
  const full = await Promise.all(ids.map((id) => api.users.messages.get({ userId: 'me', id, format: 'full' }).then((r) => r.data)));
  const parsed = full.map(parseMessage);
  return filterBySubject(parsed, subject).slice(0, MAIL_MAX_MESSAGES);
}

// One message, only if its subject matches the expected subject (used before any attachment download).
export async function messageForSubject(messageId, subject) {
  const api = gmail();
  const res = await api.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const m = parseMessage(res.data);
  return subjectMatches(m.subject, subject) ? m : null;
}

// Attachment bytes (base64url in the API). Returns a Buffer.
export async function attachmentBytes(messageId, attachmentId) {
  const api = gmail();
  const res = await api.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
  return Buffer.from(String(res.data.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
