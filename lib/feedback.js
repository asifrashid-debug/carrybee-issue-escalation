// KAM feedback rules (pure functions, shared by API routes and the tracker UI).
//
// - Every new issue gets kam_feedback_status 'Pending' and a 24h window from when it was raised.
// - The owner gives one of: Resolved, Not Resolved, Improper Remarks.
// - Owner = the KAM on KAM issues (the raiser, or a user whose name matches kam_name);
//   on MX issues the assigned KAM by name, or any CM member (cm_member / cm_lead) while kam_name is 'CM'. Admin can always act.
// - Window missed -> justification due. Each justification reopens a 24h window. 2 justifications are allowed.
// - Window missed after the 2nd justification -> Feedback failure, raised to the Team Lead. Team Lead (or admin) records feedback.
import { canView } from './roles.js';

export const FEEDBACK_PENDING = 'Pending';
export const FEEDBACK_OUTCOMES = ['Resolved', 'Not Resolved', 'Improper Remarks'];
export const FEEDBACK_WINDOW_HOURS = 24;
export const JUSTIFICATION_LIMIT = 2;
const H = 3600e3;

export const PHASE_LABEL = {
  provided: 'Feedback given',
  pending: 'Due within 24h',
  justification_due: 'Justification due',
  escalated: 'Feedback failure · with Team Lead',
};

export function windowEndFrom(time) {
  return new Date(new Date(time).getTime() + FEEDBACK_WINDOW_HOURS * H).toISOString();
}

// Phase: provided | pending | justification_due | escalated
export function feedbackPhase(esc, now = new Date()) {
  if (!esc || esc.kam_feedback_status !== FEEDBACK_PENDING) return 'provided';
  if (now.getTime() <= new Date(esc.feedback_due_at).getTime()) return 'pending';
  if ((esc.feedback_justifications || 0) < JUSTIFICATION_LIMIT) return 'justification_due';
  return 'escalated';
}

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Owner of the feedback for this issue (see rules above). Hub roles are never owners.
export function isFeedbackOwner(user, esc) {
  if (!user || !esc) return false;
  if (user.role === 'admin') return true;
  if (['hub_ops', 'management'].includes(user.role)) return false; // hub and read-only roles never own feedback
  const kam = norm(esc.kam_name);
  if (esc.channel === 'KAM' && esc.email === user.email) return true;
  if (kam && kam !== 'cm' && kam === norm(user.display_name)) return true;
  if (kam === 'cm' && ['cm_member', 'cm_lead'].includes(user.role)) return true;
  return false;
}

// Who may record an outcome right now. Returns null when allowed, or { status, error }.
export function feedbackWriteBlock(user, esc, nextStatus, requester, now = new Date()) {
  if (!FEEDBACK_OUTCOMES.includes(nextStatus)) return { status: 400, error: 'Feedback must be Resolved, Not Resolved or Improper Remarks.' };
  const phase = feedbackPhase(esc, now);
  if (phase === 'justification_due') return { status: 409, error: 'Submit your justification before giving feedback.' };
  if (phase === 'escalated') {
    if (user.role === 'admin') return null;
    if (['team_lead', 'cm_lead'].includes(user.role) && canView(user, esc, requester)) return null;
    return { status: 403, error: 'This is a Feedback failure with the Team Lead. Only the Team Lead or admin can record feedback now.' };
  }
  if (isFeedbackOwner(user, esc)) return null;
  return { status: 403, error: 'Only the KAM or CM owner of this issue can give feedback.' };
}

// What the drawer needs for the signed-in viewer.
export function feedbackView(user, esc, justifications = [], requester = null, now = new Date()) {
  const phase = feedbackPhase(esc, now);
  const writeOk = feedbackWriteBlock(user, esc, 'Resolved', requester, now) === null;
  return {
    status: esc.kam_feedback_status,
    phase,
    phase_label: PHASE_LABEL[phase],
    due_at: esc.feedback_due_at,
    given_at: esc.feedback_given_at || null,
    escalated_at: esc.feedback_escalated_at || null,
    justifications_used: esc.feedback_justifications || 0,
    justification_limit: JUSTIFICATION_LIMIT,
    justifications: justifications.map((j) => ({ round: j.round, justification: j.justification, submitted_by: j.submitted_by, submitted_at: j.submitted_at })),
    can_respond: writeOk,
    can_justify: phase === 'justification_due' && isFeedbackOwner(user, esc),
  };
}
