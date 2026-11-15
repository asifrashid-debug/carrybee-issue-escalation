// Server-side issue visibility. Used by the list, single issue, export, analytics, followup and pick routes.
// Rules live in lib/roles.js (canView, emailScope, inCmPool). This module loads the viewer's data
// and turns the rules into a PostgREST filter (for lists) or an in-memory check (for single rows).
import { canView, emailScope } from './roles.js';

// Loads what the rules need for this viewer. Admin gets { all: true } (no restriction).
export async function loadScope(sb, user) {
  if (!user) return null;
  if (user.role === 'admin') return { all: true, user };
  const { data } = await sb.from('users_roles').select('email, role, teams').eq('is_active', true);
  const users = data || [];
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const pool = user.role === 'cm_member' || user.role === 'cm_lead';
  let pickedIds = [];
  if (pool) {
    // Picks are recorded in the audit log (issue_pick_time, actor = picker)
    const { data: picks } = await sb.from('audit_log').select('issue_id').eq('field_name', 'issue_pick_time').eq('actor_email', user.email);
    pickedIds = [...new Set((picks || []).map((p) => p.issue_id))];
  }
  return { all: false, user, byEmail, emails: emailScope(user, users), pickedIds, pool };
}

// In-memory check for one issue row. Needs issue_id, email, cm_assigned and issue_pick_time on the row.
export function isVisible(scope, esc) {
  if (!scope || !esc) return false;
  if (scope.all) return true;
  const requester = scope.byEmail.get(esc.email) || null;
  return canView(scope.user, esc, requester, scope.pickedIds.includes(esc.issue_id));
}

// PostgREST or() filter that matches isVisible for list queries on escalations.
export function scopeFilter(scope) {
  const q = (v) => `"${String(v).replace(/"/g, '')}"`;
  const parts = [];
  if (scope.emails.length) parts.push(`email.in.(${scope.emails.map(q).join(',')})`);
  if (scope.pickedIds.length) parts.push(`issue_id.in.(${scope.pickedIds.map(q).join(',')})`);
  if (scope.pool) parts.push('and(cm_assigned.eq.true,issue_pick_time.is.null)');
  return parts.length ? parts.join(',') : 'issue_id.eq.__none__';
}
