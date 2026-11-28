// Escalate to IR, Central Sort or TNL from a tracker card: pure rules (no network, no database).
// Used by the escalate API (app/api/escalations/[id]/escalate) and the tracker card. Tested in tests/escalateTo.test.mjs.
//
// What it does: the issue is written to the chosen team's sheet, the team's route flag is set, and the escalated_* columns
// (added by migration 027) record the team, the time and the person. An escalated issue leaves the main tracker list and
// shows under the Escalated filter. It stays on its team tab.
import { IR_MAIL_SUBJECT_MAX, cleanMailSubject } from './irEscalation.mjs';

// key = value sent by the card; label = shown to users; route = the route flag column set to true.
export const ESCALATE_TEAMS = {
  ir: { key: 'ir', label: 'IR', route: 'route_ir' },
  central_sort: { key: 'central_sort', label: 'Central Sort', route: 'route_central_sort' },
  tnl: { key: 'tnl', label: 'TNL', route: 'route_tnl' },
};

export const ESCALATED_VIEW = 'escalated';

// The team for a request value, or null when it is not one of the three.
export function escalateTeam(value) {
  const key = String(value ?? '').trim();
  return Object.prototype.hasOwnProperty.call(ESCALATE_TEAMS, key) ? ESCALATE_TEAMS[key] : null;
}

// Label for a stored escalated_to value. Unknown values are shown as they are.
export function escalatedLabel(value) {
  const t = Object.values(ESCALATE_TEAMS).find((x) => x.key === value);
  return t ? t.label : String(value ?? '');
}

// Returns an error message, or null. IR needs a Mail Subject Line. Central Sort and TNL need nothing extra.
export function escalateError(team, mailSubject) {
  if (!team) return 'Choose IR, Central Sort or TNL.';
  if (team.key === 'ir') {
    const subject = cleanMailSubject(mailSubject);
    if (!subject) return 'Enter a Mail Subject Line for IR.';
    if (String(mailSubject ?? '').trim().length > IR_MAIL_SUBJECT_MAX) return `Mail Subject Line must be ${IR_MAIL_SUBJECT_MAX} characters or fewer.`;
  }
  return null;
}

// The columns to write to escalations for this escalation. Mail subject is set only for IR.
export function escalateFields(team, mailSubject, byEmail, now = new Date()) {
  const fields = {
    [team.route]: true,
    escalated_to: team.key,
    escalated_at: now.toISOString(),
    escalated_by: String(byEmail || '').trim() || null,
  };
  if (team.key === 'ir') fields.mail_subject = cleanMailSubject(mailSubject);
  return fields;
}
