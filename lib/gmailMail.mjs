// IR mail: pure helpers for matching and reading Gmail messages (no network). Tested in tests/irMail.test.mjs.
// The IR mail is found by its subject line (the \"Mail Subject Line\" the KAM enters on the IR form).

export const MAIL_BODY_MAX = 20000; // characters returned to the drawer
export const MAIL_MAX_MESSAGES = 10;

// Subject comparison: trims, collapses spaces, ignores case. Exact otherwise (no fuzzy matching).
export function normSubject(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}
export function subjectMatches(headerSubject, wanted) {
  const w = normSubject(wanted);
  return !!w && normSubject(headerSubject) === w;
}

// Gmail search for the subject phrase. Double quotes inside the subject are removed so the phrase stays intact.
export function gmailQueryForSubject(subject) {
  const phrase = String(subject ?? '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
  return `subject:"${phrase}" -in:spam -in:trash`;
}

// Gmail uses base64url for bodies and attachments.
export function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function headerValue(headers, name) {
  const h = (headers || []).find((x) => String(x.name || '').toLowerCase() === name.toLowerCase());
  return h ? h.value || '' : '';
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Walks the MIME tree. Returns { text, html, attachments }.
export function collectParts(payload) {
  const out = { text: '', html: '', attachments: [] };
  function walk(part) {
    if (!part) return;
    const filename = part.filename || '';
    const attId = part.body?.attachmentId;
    if (filename && attId) {
      out.attachments.push({ attachmentId: attId, filename, mimeType: part.mimeType || 'application/octet-stream', size: part.body?.size || 0 });
    } else if (part.mimeType === 'text/plain' && part.body?.data && !out.text) {
      out.text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data && !out.html) {
      out.html = decodeBase64Url(part.body.data);
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return out;
}

// One Gmail API message (format: full) -> the fields the drawer shows.
export function parseMessage(msg) {
  const payload = msg?.payload || {};
  const headers = payload.headers || [];
  const parts = collectParts(payload);
  let body = parts.text || stripHtml(parts.html);
  const truncated = body.length > MAIL_BODY_MAX;
  if (truncated) body = body.slice(0, MAIL_BODY_MAX);
  return {
    id: msg.id,
    threadId: msg.threadId || null,
    subject: headerValue(headers, 'Subject'),
    from: headerValue(headers, 'From'),
    to: headerValue(headers, 'To'),
    cc: headerValue(headers, 'Cc'),
    date: headerValue(headers, 'Date') || (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null),
    body,
    body_truncated: truncated,
    attachments: parts.attachments,
  };
}

// Keeps only messages whose Subject header equals the issue's mail subject, newest first.
export function filterBySubject(messages, subject) {
  return messages
    .filter((m) => subjectMatches(m.subject, subject))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// Safe download name for a file from the mail.
export function safeAttachmentName(name) {
  return String(name || 'attachment').split(/[\\/]/).pop().replace(/[^\w .()-]+/g, '_').slice(0, 150) || 'attachment';
}
