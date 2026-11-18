// Server-side issue visibility. Used by the list, single issue, export, analytics, followup and pick routes.
// Rules live in lib/roles.js (canView, emailScope, inCmPool). This module loads the viewer's data
// and turns the rules into a PostgREST filter (for lists) or an in-memory check (for single rows).
import { canView, emailScope } from './roles.js';

// Loads what the rules need for this viewer. Admin gets { all: true } (no restriction).
export async function loadScope(sb, user) {
  if (!user) return null;
  if (user.role === 'admin') return { all: true, user };
  const { data } = await sb.from('users_roles').select('email, role, teams, display_name, kam_aliases').eq('is_active', true);
  const users = data || [];
  const byEmail = new Map(users.map((u) => [u.email, u]));
  // Viewer's KAM names (display name + aliases) so named-KAM rules apply to this user.
  const self = byEmail.get(user.email) || {};
  const viewer = { ...user, display_name: user.display_name || self.display_name, kam_aliases: self.kam_aliases || [] };
  const kamNameList = ['requester', 'team_lead', 'mx'].includes(viewer.role)
    ? [viewer.display_name, ...viewer.kam_aliases].filter(Boolean)
    : [];
  const pool = viewer.role === 'cm_member' || viewer.role === 'cm_lead';
  let pickedIds = [];
  if (pool) {
    // CM picks are recorded in the audit log (business_pick_time, actor = picker)
    const { data: picks } = await sb.from('audit_log').select('issue_id').in('field_name', ['business_pick_time', 'issue_pick_time']).eq('actor_email', user.email);
    pickedIds = [...new Set((picks || []).map((p) => p.issue_id))];
  }
  return { all: false, user: viewer, byEmail, emails: emailScope(viewer, users), pickedIds, pool, kamNameList };
}

// In-memory check for one issue row. Needs issue_id, email, cm_assigned and business_pick_time on the row.
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
  if (scope.pool) parts.push('and(cm_assigned.eq.true,business_pick_time.is.null)');
  // MX issues named to this KAM (exact kam_name match; in-memory check in canView is case/space-insensitive)
  if (scope.kamNameList?.length) parts.push(`and(channel.eq.MX,kam_name.in.(${scope.kamNameList.map(q).join(',')}))`);
  return parts.length ? parts.join(',') : 'issue_id.eq.__none__';
}
