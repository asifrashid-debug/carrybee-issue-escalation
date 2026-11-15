// CM pick SLA for MX issues assigned to CM (kam_name 'CM' at raise; flag cm_assigned).
// - Pick within 10 min (P1), 15 min (P2), 20 min (P3) of raising. P4 is not in the rule; it uses 20 min.
// - Only CM members (cm_member, cm_lead) and admin may pick these issues.
// - A missed or late pick needs a justification. It is asked twice. Each has a 24h window.
//   If a window passes without a justification -> Feedback failure, shown to the CM lead.
// Pure module: used by API routes and the tracker UI.
import { canView } from './roles.js';

export const PICK_SLA_MINUTES = { P1: 10, P2: 15, P3: 20, P4: 20 };
export const PICK_JUSTIFICATION_LIMIT = 2;
export const PICK_JUSTIFICATION_WINDOW_HOURS = 24;
const MIN = 60e3, H = 3600e3;
const CM_ROLES = ['cm_member', 'cm_lead'];

export const PICK_PHASE_LABEL = {
  'n/a': '',
  pending: 'Pick due',
  met: 'Picked on time',
  justification_due: 'Pick missed · justification due',
  justified: 'Pick missed · justified',
  escalated: 'Pick failure · with CM lead',
};

const ms = (t) => (t == null ? null : new Date(t).getTime());

export function pickDeadline(submittedAt, priority) {
  const m = PICK_SLA_MINUTES[priority];
  if (!m) return null;
  return new Date(ms(submittedAt) + m * MIN).toISOString();
}

export function pickJustifyDueFrom(time) {
  return new Date(ms(time) + PICK_JUSTIFICATION_WINDOW_HOURS * H).toISOString();
}

// Phase: n/a | pending | met | justification_due | justified | escalated
export function pickPhase(esc, now = new Date()) {
  if (!esc?.cm_assigned) return 'n/a';
  const t = now.getTime();
  const due = ms(esc.pick_due_at);
  const picked = esc.issue_pick_time != null;
  const missed = picked ? ms(esc.issue_pick_time) > due : t > due;
  if (!missed) return picked ? 'met' : 'pending';
  if ((esc.pick_justifications || 0) >= PICK_JUSTIFICATION_LIMIT) return 'justified';
  if (t <= ms(esc.pick_justify_due_at)) return 'justification_due';
  return 'escalated';
}

export function isCmPicker(user) {
  return !!user && (CM_ROLES.includes(user.role) || user.role === 'admin');
}

// Pick permission for CM-assigned issues. Returns null when allowed, or { status, error }.
export function pickBlock(user, esc) {
  if (!esc?.cm_assigned) return null; // other issues keep the existing pick rules
  if (isCmPicker(user)) return null;
  return { status: 403, error: 'Only CM members can pick this issue.' };
}

// Who can justify a missed pick: any CM member or admin.
export function canJustifyPick(user, esc) {
  return !!esc?.cm_assigned && isCmPicker(user);
}

export function pickWriteBlock(user, esc, now = new Date()) {
  if (!esc?.cm_assigned) return { status: 409, error: 'This issue has no CM pick SLA.' };
  if (!canJustifyPick(user, esc)) return { status: 403, error: 'Only CM members can justify a missed pick.' };
  const phase = pickPhase(esc, now);
  if (phase === 'escalated') return { status: 409, error: 'The justification window has passed. This is a Pick failure with the CM lead.' };
  if (phase !== 'justification_due') return { status: 409, error: 'No justification is due for this issue right now.' };
  return null;
}

// Drawer view for the viewer.
export function pickView(user, esc, justs = [], now = new Date()) {
  const phase = pickPhase(esc, now);
  const block = pickWriteBlock(user, esc, now);
  return {
    applies: !!esc?.cm_assigned,
    phase,
    phase_label: PICK_PHASE_LABEL[phase],
    priority: esc?.priority_scale,
    minutes_limit: PICK_SLA_MINUTES[esc?.priority_scale] ?? null,
    deadline_at: esc?.pick_due_at || null,
    picked_at: esc?.issue_pick_time || null,
    missed: !!esc?.cm_assigned && (esc.issue_pick_time ? ms(esc.issue_pick_time) > ms(esc.pick_due_at) : now.getTime() > ms(esc.pick_due_at)),
    justify_due_at: esc?.pick_justify_due_at || null,
    justifications_used: esc?.pick_justifications || 0,
    justification_limit: PICK_JUSTIFICATION_LIMIT,
    escalated_at: esc?.pick_escalated_at || null,
    justifications: justs.map((j) => ({ round: j.round, justification: j.justification, submitted_by: j.submitted_by, submitted_at: j.submitted_at })),
    can_justify: block === null,
  };
}

// Visibility helper: CM members see the unpicked CM pool and their own picks (lib/roles.js canView).
export function cmCanSee(user, esc, requester, pickedByMe = false) {
  return canView(user, esc, requester, pickedByMe);
}
