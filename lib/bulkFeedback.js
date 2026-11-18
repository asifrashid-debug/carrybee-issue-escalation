// Bulk KAM feedback (pure rules). The API routes load rows and scope, then call this.
// Who: team_lead (own team, via scope), cm_lead (issues visible to them), admin (all).
// Window: bulk never checks the 24h feedback window (same as before), so no role needs it skipped.
// Blocks apply to 'Resolved' only:
//   - no hub response (layer1_response empty), for everyone except admin
//   - ops status Unresolved or On Hold, for everyone
// 'Not Resolved' keeps the scope and already-set checks only.
import { isVisible } from './visibility.js';

export const BULK_OUTCOMES = ['Resolved', 'Not Resolved'];
export const BULK_LIMIT = 50;
export const BULK_ROLES = ['team_lead', 'cm_lead', 'admin'];
export const BULK_BLOCKED_OPS = ['Unresolved', 'On Hold'];

// Reason this issue cannot be bulk-set to `outcome`, or null when it can.
export function bulkBlockReason(user, row, scope, outcome) {
  if (!isVisible(scope, row)) return 'Not in your scope';
  if (row.kam_feedback_status === outcome) return `Already ${outcome}`;
  if (outcome === 'Resolved') {
    if (user.role !== 'admin' && !String(row.layer1_response || '').trim()) return 'No hub response yet';
    if (BULK_BLOCKED_OPS.includes(row.ops_issue_status)) return `Ops status is ${row.ops_issue_status}`;
  }
  return null;
}

// Returns { error, status } when the request is refused, otherwise { allowed, skipped }.
export function bulkFeedbackPlan(user, rows, scope, outcome) {
  if (!user || !BULK_ROLES.includes(user.role)) return { error: 'Only team leads, CM leads and admin can bulk-update KAM feedback.', status: 403 };
  if (!BULK_OUTCOMES.includes(outcome)) return { error: 'Outcome must be Resolved or Not Resolved.', status: 400 };
  const allowed = [];
  const skipped = [];
  for (const r of rows) {
    const reason = bulkBlockReason(user, r, scope, outcome);
    if (reason) skipped.push({ issue_id: r.issue_id, reason });
    else allowed.push(r);
  }
  return { allowed, skipped };
}
