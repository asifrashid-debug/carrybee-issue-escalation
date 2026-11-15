// Team Lead bulk KAM feedback (pure rules). The API route loads rows and scope, then calls this.
import { isVisible } from './visibility.js';

export const BULK_OUTCOMES = ['Resolved', 'Not Resolved'];
export const BULK_LIMIT = 50;

// Returns { error, status } when the request is refused, otherwise { allowed, skipped }.
export function bulkFeedbackPlan(user, rows, scope, outcome) {
  if (!user || user.role !== 'team_lead') return { error: 'Only team leads can bulk-update KAM feedback.', status: 403 };
  if (!BULK_OUTCOMES.includes(outcome)) return { error: 'Outcome must be Resolved or Not Resolved.', status: 400 };
  const allowed = [];
  const skipped = [];
  for (const r of rows) {
    if (!isVisible(scope, r)) { skipped.push({ issue_id: r.issue_id, reason: 'Not in your team' }); continue; }
    if (r.kam_feedback_status === outcome) { skipped.push({ issue_id: r.issue_id, reason: `Already ${outcome}` }); continue; }
    allowed.push(r);
  }
  return { allowed, skipped };
}
