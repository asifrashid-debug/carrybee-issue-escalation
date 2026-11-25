import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { pushIrRow } from '../../../../lib/irSheet';
import { IR_EDITABLE_FIELDS, IR_STATUSES, IR_MEMBERS, irStatusStamps } from '../../../../lib/irEscalation.mjs';

export const dynamic = 'force-dynamic';

// IR sheet edits, sent by the Apps Script in apps-script/IR-Code.gs (install it on the IR sheet).
// Posts { issue_id, field, new_value, editor_email, edit_time, secret }. Only the IR-editable columns are accepted.
// Drive Link, the KAM fields and the other columns are written by the tracker, never by the sheet.
const FIELDS = Object.values(IR_EDITABLE_FIELDS);

export async function POST(req) {
  const body = await req.json();
  // Unlike the hub webhook, the secret is required here. Without WEBHOOK_SECRET nothing is accepted.
  if (!process.env.WEBHOOK_SECRET || body.secret !== process.env.WEBHOOK_SECRET) return NextResponse.json({ error: 'Bad secret' }, { status: 401 });
  const sb = supabaseAdmin();
  const { issue_id, field, new_value, editor_email } = body;
  if (!issue_id || !field) return NextResponse.json({ error: 'issue_id + field required' }, { status: 400 });
  if (!FIELDS.includes(field)) return NextResponse.json({ ok: false, error: `Field ${field} is not editable from the IR sheet` }, { status: 400 });
  const { data: cur } = await sb.from('escalations').select('*').eq('issue_id', issue_id).single();
  if (!cur) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  if (!cur.route_ir) return NextResponse.json({ ok: false, error: 'This issue is not routed to IR' }, { status: 400 });
  const value = String(new_value ?? '').trim();
  if (field === 'ir_status' && value && !IR_STATUSES.includes(value)) {
    await sb.from('audit_log').insert({ issue_id, field_name: field, old_value: cur[field] ? String(cur[field]) : null, new_value: `REJECTED: ${value}`, actor_email: editor_email || 'sheet', source: 'sheet' });
    await sb.from('sync_log').insert({ direction: 'sheet_to_db', issue_id, status: 'failed', error_message: `IR Status "${value}" is not in the list` });
    try { await pushIrRow(cur); } catch (err) { await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id, status: 'failed', error_message: `IR revert failed: ${String(err.message || err).slice(0, 250)}` }); }
    return NextResponse.json({ ok: false, error: `IR Status must be one of: ${IR_STATUSES.join(', ')}` });
  }
  // Assigned IR Member: only the listed names (the sheet dropdown is strict, this is the server check). Invalid values are reverted.
  if (field === 'ir_assigned_member' && value && !IR_MEMBERS.includes(value)) {
    await sb.from('audit_log').insert({ issue_id, field_name: field, old_value: cur[field] ? String(cur[field]) : null, new_value: `REJECTED: ${value}`, actor_email: editor_email || 'sheet', source: 'sheet' });
    await sb.from('sync_log').insert({ direction: 'sheet_to_db', issue_id, status: 'failed', error_message: `Assigned IR Member \"${value}\" is not in the list` });
    try { await pushIrRow(cur); } catch (err) { await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id, status: 'failed', error_message: `IR revert failed: ${String(err.message || err).slice(0, 250)}` }); }
    return NextResponse.json({ ok: false, error: `Assigned IR Member must be one of: ${IR_MEMBERS.join(', ')}` });
  }
  const now = new Date().toISOString();
  const patch = { [field]: value || null, row_version: (cur.row_version || 1) + 1 };
  // IR Status drives the pick and resolve SLA timestamps
  if (field === 'ir_status') Object.assign(patch, irStatusStamps(cur, value, now));
  const { data, error } = await sb.from('escalations').update(patch).eq('issue_id', issue_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('audit_log').insert({ issue_id, field_name: field, old_value: cur[field] ? String(cur[field]) : null, new_value: value, actor_email: editor_email || 'sheet', source: 'sheet' });
  await sb.from('sync_log').insert({ direction: 'sheet_to_db', issue_id, status: 'success', payload: { field, target: 'ir' } });
  // Refresh the IR row so the sheet shows the stored values, including the SLA cells. A failure is logged only.
  try { await pushIrRow(data); } catch (err) {
    await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id, status: 'failed', error_message: `IR row refresh failed: ${String(err.message || err).slice(0, 250)}` });
  }
  return NextResponse.json({ ok: true, data });
}
