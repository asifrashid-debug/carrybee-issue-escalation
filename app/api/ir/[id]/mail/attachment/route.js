import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { requireUser } from '../../../../../../lib/session';
import { loadScope, isVisible } from '../../../../../../lib/visibility';
import { messageForSubject, attachmentBytes } from '../../../../../../lib/gmailClient';
import { safeAttachmentName } from '../../../../../../lib/gmailMail.mjs';

export const dynamic = 'force-dynamic';

// GET /api/ir/{issue_id}/mail/attachment?message=ID&attachment=ID
// Downloads one attachment, but only from a message whose Subject equals this issue's mail subject.
export async function GET(req, ctx) {
  const params = await ctx.params;
  const auth = await requireUser(); if (auth.response) return auth.response;
  const session = auth.user;
  const sb = supabaseAdmin();
  const { data: cur } = await sb.from('escalations').select('issue_id, route_ir, mail_subject, email').eq('issue_id', params.id).single();
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isVisible(await loadScope(sb, session), cur)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!cur.route_ir || !(cur.mail_subject || '').trim()) return NextResponse.json({ error: 'No mail for this issue.' }, { status: 400 });
  const url = new URL(req.url);
  const messageId = url.searchParams.get('message') || '';
  const attachmentId = url.searchParams.get('attachment') || '';
  if (!messageId || !attachmentId) return NextResponse.json({ error: 'message and attachment are required.' }, { status: 400 });
  try {
    const msg = await messageForSubject(messageId, cur.mail_subject);
    if (!msg) return NextResponse.json({ error: 'That mail does not belong to this issue.' }, { status: 404 });
    const att = msg.attachments.find((a) => a.attachmentId === attachmentId);
    if (!att) return NextResponse.json({ error: 'Attachment not found on that mail.' }, { status: 404 });
    const bytes = await attachmentBytes(messageId, attachmentId);
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeAttachmentName(att.filename)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Could not download the attachment: ${String(err.message || err).slice(0, 200)}` }, { status: 502 });
  }
}
