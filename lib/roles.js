import { sameEmail } from './cmAssign.js';
// RBAC per PRD permissions matrix (pilot: demo user selected from users_roles).
// `requester` = the users_roles row of esc.email (pass it for team/MX scoping; optional).
//
// Visibility (SOP section 9, confirmed rules):
// - Everyone: own issues.
// - Business team member, KAM team member (requester, mx): MX issues whose assigned KAM name is their name (or alias).
// - Team lead (business and KAM): issues raised by their team members, and issues whose assigned KAM name is a
//   team member's name (any channel). The lead's own name counts as a team name.
// - CM member: MX issues, and issues whose assigned KAM name is CM.
// - CM team lead: MX issues, and issues raised by CM members.
// - Admin: everything. Management, regional_lead, hub_ops: no tracker access.
//
// Team roles (from team login sheet):
// - team_lead: as above, using user.teams
// - cm_lead / cm_member: as above
// - requester, mx: own issues plus named-KAM MX issues

function sharesTeam(user, requester) {
  return !!requester && (requester.teams || []).some(t => (user.teams || []).includes(t));
}
function isMxRaised(requester) { return requester?.role === 'mx' || (requester?.teams || []).includes('IB'); }
function isCmRaised(requester) { return requester?.role === 'cm_member' || (requester?.teams || []).includes('CM'); }

const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
// Names a KAM goes by: display name plus users_roles.kam_aliases (migration 016). 'CM' is a queue, not a person.
// CM members and CM leads: they also see the CM queue (Ops Issues with KAM Name 'CM') in Ops-KAM and get its bell notices.
export const CM_ROLES = ['cm_member', 'cm_lead'];
export function kamNames(user) {
  return [user?.display_name, ...(user?.kam_aliases || [])].map(normName).filter((n) => n && n !== 'cm');
}
// Names of everyone on the team lead's team(s), plus the lead's own names. Used for the team lead rule.
export function teamKamNames(user, users) {
  if (!user || user.role !== 'team_lead') return [];
  const members = (users || []).filter((u) => sharesTeam(user, u));
  const names = [...kamNames(user), ...members.flatMap((u) => kamNames(u))];
  return [...new Set(names)];
}
// MX issue whose kam_name is one of the viewer's names: that KAM can see and act on it.
export function isNamedKam(user, esc) {
  if (!user || !esc || esc.channel !== 'MX') return false;
  if (!['requester', 'team_lead', 'mx'].includes(user.role)) return false;
  return kamNames(user).includes(normName(esc.kam_name));
}
// Issue whose assigned KAM name is CM (the CM queue).
export function isCmQueue(esc) {
  return normName(esc?.kam_name) === 'cm';
}
// Issue raised from the MX channel.
export function isMxChannel(esc) {
  return String(esc?.channel || '').trim().toUpperCase() === 'MX';
}

// Raiser emails a viewer can see by who raised the issue (own issues plus team issues).
// Named-KAM and channel rules are added by lib/visibility.js (scopeFilter).
export function emailScope(user, users) {
  if (!user?.email) return [];
  const list = users || [];
  if (user.role === 'team_lead') return [user.email, ...list.filter((u) => sharesTeam(user, u)).map((u) => u.email)];
  if (user.role === 'cm_lead') return [user.email, ...list.filter((u) => isCmRaised(u)).map((u) => u.email)];
  if (user.role === 'cm_member' || user.role === 'requester' || user.role === 'mx') return [user.email];
  return []; // admin is unrestricted (handled by caller); management, regional_lead, hub_ops: no tracker access
}

// Issue visibility. Picks do not grant visibility. requester = the users_roles row of esc.email (for team scoping).
export function canView(user, esc, requester) {
  if (!user || !esc) return false;
  if (user.role === 'admin') return true;
  if (esc.email === user.email) return true; // own issues, every role with tracker access
  switch (user.role) {
    case 'team_lead':
      // issues raised by team members, or whose assigned KAM name is a team member's name (any channel)
      return sharesTeam(user, requester) || (user.team_kam_names || []).includes(normName(esc.kam_name));
    case 'cm_lead':
      // any MX issue, or any issue raised by a CM member
      return isMxChannel(esc) || isCmRaised(requester);
    case 'cm_member':
      // any MX issue, or any issue whose assigned KAM name is CM
      return isMxChannel(esc) || isCmQueue(esc);
    case 'requester':
    case 'mx':
      // MX issue whose assigned KAM name is one of the viewer's names
      return isNamedKam(user, esc);
    default:
      return false; // management, regional_lead, hub_ops: no tracker access
  }
}
export function canEditRequesterPrePick(user, esc) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if ((user.role === 'requester' || user.role === 'mx') && esc.email === user.email && !esc.issue_pick_time) return true;
  return false;
}
export function canEditRequesterPostPick(user, esc) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if ((user.role === 'requester' || user.role === 'mx') && esc.email === user.email) return true; // only KAM Feedback + Issue Status enforced in API
  return false;
}
export function canEditOps(user, esc, requester) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // hub_ops removed: hub updates come from the hub response sheet (see lib/hubPolicy.js)
  if (user.role === 'regional_lead' && (esc.zone === user.zone || user.region === esc.division)) return true;
  // All MX-related updates are assigned to CM
  if ((user.role === 'cm_lead' || user.role === 'cm_member') && isMxRaised(requester)) return true;
  return false;
}
// CM picked button. Opens only when the issue was raised from the MX channel with KAM name CM (cm_assigned)
// and has not been picked yet. A CM member may press it only on the issue assigned to them (cm_owner_email).
// CM lead and admin may press it on any CM-assigned issue. MX users never see it.
export function canPick(user, esc) {
  if (!user || !esc) return false;
  if (!isMxChannel(esc) || normName(esc.kam_name) !== 'cm') return false;
  if (!esc.cm_assigned || esc.business_pick_time) return false;
  if (['admin', 'cm_lead'].includes(user.role)) return true;
  return user.role === 'cm_member' && sameEmail(esc.cm_owner_email, user.email);
}
export function canChangeZone(user) { return user?.role === 'admin'; }
export function canManageMasters(user) { return user?.role === 'admin'; }
export function canExport(user) { return !!user; }
