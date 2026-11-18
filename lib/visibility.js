// Server-side issue visibility. Used by the list, single issue, export, analytics, followup and pick routes.
// Rules live in lib/roles.js (canView, emailScope, teamKamNames). This module loads the viewer's data
// and turns the rules into a PostgREST filter (for lists) or an in-memory check (for single rows).
// The filter and the in-memory check must give the same answer for every issue.
import { canView, emailScope, teamKamNames, kamNames } from './roles.js';

// Quotes a value for a PostgREST filter and strips characters that would change the match.
const quoteFilterValue = (v) => `"${String(v).replace(/["%_*]/g, '')}"`;

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
  // Named-KAM MX rule for requester and mx roles (own names only)
  const kamNameList = ['requester', 'mx'].includes(viewer.role) ? kamNames(viewer) : [];
  // Team lead rule: names of everyone on the team, plus the lead's own names (any channel)
  viewer.team_kam_names = teamKamNames(viewer, users);
  const isCm = viewer.role === 'cm_member' || viewer.role === 'cm_lead';
  let pickedIds = [];
  if (isCm) {
    // Picks are kept for the 'mine' view only. They no longer decide visibility.
    const { data: picks } = await sb.from('audit_log').select('issue_id').in('field_name', ['business_pick_time', 'issue_pick_time']).eq('actor_email', user.email);
    pickedIds = [...new Set((picks || []).map((p) => p.issue_id))];
  }
  return { all: false, user: viewer, byEmail, emails: emailScope(viewer, users), pickedIds, kamNameList, teamKamNames: viewer.team_kam_names };
}

// In-memory check for one issue row. Needs issue_id, email, channel, kam_name and cm_assigned on the row.
export function isVisible(scope, esc) {
  if (!scope || !esc) return false;
  if (scope.all) return true;
  const requester = scope.byEmail.get(esc.email) || null;
  return canView(scope.user, esc, requester);
}

// PostgREST or() filter that matches isVisible for list queries on escalations.
export function scopeFilter(scope) {
  const parts = [];
  const role = scope.user?.role;
  const kamNameMatch = (names) => names.map((n) => `kam_name.ilike.${quoteFilterValue(n)}`).join(',');
  // Own issues and issues raised by the viewer's team (or CM team lead's CM members)
  if (scope.emails.length) parts.push(`email.in.(${scope.emails.map(quoteFilterValue).join(',')})`);
  // Team lead: assigned KAM name is a team member's name (any channel)
  if (role === 'team_lead' && scope.teamKamNames?.length) parts.push(kamNameMatch(scope.teamKamNames));
  // CM member and CM team lead: any MX-channel issue
  if (role === 'cm_member' || role === 'cm_lead') parts.push('channel.eq.MX');
  // CM member: assigned KAM name is CM
  if (role === 'cm_member') parts.push(`kam_name.ilike.${quoteFilterValue('CM')}`);
  // Requester and MX: MX issue whose assigned KAM name is the viewer's name
  if (scope.kamNameList?.length) {
    parts.push(`and(channel.eq.MX,or(${kamNameMatch(scope.kamNameList)}))`);
  }
  return parts.length ? parts.join(',') : 'issue_id.eq.__none__';
}
