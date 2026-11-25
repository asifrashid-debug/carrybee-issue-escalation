import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/session';
import { loadScope, isVisible } from '../../../../../lib/visibility';
import { gmailConfigured, mailsForSubject } from '../../../../../lib/gmailClient';

export const dynamic = 'force-dynamic';

// GET /api/ir/{issue_id}/mail
// The mails in the GMAIL_USER mailbox whose Subject equals this IR issue's mail subject line.
// Read-only. Visibility is the same as the IR tab.
export async function GET(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response;
  const session = auth.user;
  const sb = supabaseAdmin();
  const { data: cur } = await sb.from('escalations').select('issue_id, route_ir, mail_subject, email').eq('issue_id', params.id).single();
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!cur.route_ir) return NextResponse.json({ error: 'This issue is not routed to IR.' }, { status: 400 });
  const subject = (cur.mail_subject || '').trim();
  if (!subject) return NextResponse.json({ subject: null, messages: [], note: 'No mail subject line was entered for this issue.' });
  if (!gmailConfigured()) return NextResponse.json({ error: 'Mail lookup is not set up yet. Ask an admin to add GMAIL_OAUTH_REFRESH_TOKEN.' }, { status: 503 });
  try {
    const messages = await mailsForSubject(subject);
    // Attachments are listed by name and size. The download links use the message and attachment IDs.
    return NextResponse.json({ subject, messages, note: messages.length ? null : 'No mail with this subject was found in the mailbox yet.' });
  } catch (err) {
    return NextResponse.json({ error: `Could not read the mailbox: ${String(err.message || err).slice(0, 200)}` }, { status: 502 });
  }
}
