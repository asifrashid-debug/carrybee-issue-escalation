// Hub-response notifications. Pure helpers plus one async writer used by the sheet webhook.

// Sheet fields a hub edits. Only these create a notification.
export const NOTIFY_FIELDS = {
  layer1_response: 'Layer 1 response',
  layer2_response: 'Layer 2 response',
  layer3_response: 'Layer 3 response',
  ops_issue_status: 'issue status',
  ops_status: 'ops status',
  validation: 'validation',
};

// Recipients: the raiser, plus every team lead who shares a team with the raiser.
export function notifyRecipients(esc, raiser, users = []) {
  const out = new Set();
  const raiserEmail = String(esc?.email || '').toLowerCase();
  if (raiserEmail) out.add(raiserEmail);
  const teams = raiser?.teams || [];
  for (const u of users) {
    if (u?.role === 'team_lead' && (u.teams || []).some((t) => teams.includes(t))) out.add(String(u.email).toLowerCase());
  }
  return [...out];
}

// The notice text for one hub edit, or null when the edit should not notify.
export function hubNotice(field, value, esc) {
  const label = NOTIFY_FIELDS[field];
  if (!label) return null;
  const v = String(value ?? '').trim();
  if (!v) return null;
  const body = v.length > 160 ? `${v.slice(0, 157)}...` : v;
  return { title: `${esc.issue_id}: hub updated the ${label}`, body };
}

// Writes the notifications for one accepted hub edit. Never throws into the caller.
export async function notifyHubResponse(sb, esc, field, value) {
  try {
    const notice = hubNotice(field, value, esc);
    if (!notice) return 0;
    const { data: users } = await sb.from('users_roles').select('email, role, teams').eq('is_active', true);
    const raiser = (users || []).find((u) => u.email === String(esc.email || '').toLowerCase()) || null;
    const rows = notifyRecipients(esc, raiser, users || []).map((email) => ({
      recipient_email: email, issue_id: esc.issue_id, kind: 'hub_response', title: notice.title, body: notice.body,
    }));
    if (rows.length) await sb.from('notifications').insert(rows);
    return rows.length;
  } catch (e) {
    return 0;
  }
}
