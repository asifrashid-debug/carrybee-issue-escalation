// Bell notifications: hub responses (existing) and new CM issues (added).
// Pure helpers plus async writers used by the sheet webhook and the create-issue route.

// Sheet fields a hub edits. Only these create a notification.
export const NOTIFY_FIELDS = {
  layer1_response: 'Layer 1 response',
  layer2_response: 'Layer 2 response',
  layer3_response: 'Layer 3 response',
  ops_issue_status: 'issue status',
  ops_status: 'ops status',
  validation: 'validation',
};

// Roles that hear the sound and get a bell entry for a new CM-assigned issue.
export const CM_NOTIFY_ROLES = ['cm_member', 'cm_lead'];

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

// Active CM members and CM leads (lower-cased, unique).
export function cmRecipients(users = []) {
  const set = new Set();
  for (const u of users) {
    if (u?.email && CM_NOTIFY_ROLES.includes(u.role)) set.add(String(u.email).toLowerCase());
  }
  return [...set];
}

// Notice for a newly raised CM-assigned issue.
export function newCmIssueNotice(esc) {
  const where = [esc.zone, esc.concern_hub].filter(Boolean).join(' · ');
  const what = esc.issue_category || 'Issue';
  return { title: `${esc.issue_id}: new CM issue`, body: where ? `${what} · ${where}` : what };
}

// Bell recipients for a new CM-assigned issue: the assigned CM member (cm_owner_email, set at raise).
// If there is no owner yet (no active CM member at raise), the CM leads are told so the issue is not missed.
export function cmNoticeRecipients(esc, users = []) {
  if (!esc?.cm_assigned) return [];
  if (esc.cm_owner_email) return [esc.cm_owner_email];
  return cmRecipients(users.filter((u) => u.role === 'cm_lead'));
}

// Rows for the bell. Empty when the issue is not CM-assigned.
export function cmNoticeRows(esc, users = []) {
  if (!esc?.cm_assigned) return [];
  const notice = newCmIssueNotice(esc);
  return cmNoticeRecipients(esc, users).map((email) => ({
    recipient_email: email, issue_id: esc.issue_id, kind: 'cm_new_issue', title: notice.title, body: notice.body,
  }));
}

// Writes the CM notices for a newly created issue. Never throws into the caller.
export async function notifyNewCmIssue(sb, esc) {
  try {
    if (!esc?.cm_assigned) return 0;
    const { data: users } = await sb.from('users_roles').select('email, role').eq('is_active', true);
    const rows = cmNoticeRows(esc, users || []);
    if (rows.length) await sb.from('notifications').insert(rows);
    return rows.length;
  } catch (e) {
    return 0;
  }
}
