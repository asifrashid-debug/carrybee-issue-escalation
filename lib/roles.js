// RBAC per PRD permissions matrix (pilot: demo user selected from users_roles).
// `requester` = the users_roles row of esc.email (pass it for team/MX scoping; optional).
//
// Team roles (from team login sheet):
// - team_lead: sees own issues + issues raised by members of their team(s) (user.teams)
// - cm_lead:   sees MX (mx role / IB) and CM members' issues, plus the unpicked CM pool and own picks
// - cm_member: sees own raised issues, issues they picked, and the unpicked CM pool
// - requester, mx: own issues only
// - management, regional_lead, hub_ops: no tracker access (hub responses come from the hub response sheet)

function sharesTeam(user, requester) {
  return !!requester && (requester.teams || []).some(t => (user.teams || []).includes(t));
}
function isMxRaised(requester) { return requester?.role === 'mx' || (requester?.teams || []).includes('IB'); }
function isCmRaised(requester) { return requester?.role === 'cm_member' || (requester?.teams || []).includes('CM'); }

// Unpicked CM-assigned MX issues: the pool that every CM member can see and pick.
export function inCmPool(esc) {
  return !!esc && esc.cm_assigned === true && !esc.issue_pick_time;
}

// Raiser emails a viewer can see (own issues plus team issues). Pool and picks are added by lib/visibility.js.
export function emailScope(user, users) {
  if (!user?.email) return [];
  const list = users || [];
  if (user.role === 'team_lead') return [user.email, ...list.filter((u) => sharesTeam(user, u)).map((u) => u.email)];
  if (user.role === 'cm_lead') return [user.email, ...list.filter((u) => isMxRaised(u) || isCmRaised(u)).map((u) => u.email)];
  if (user.role === 'cm_member' || user.role === 'requester' || user.role === 'mx') return [user.email];
  return []; // admin is unrestricted (handled by caller); management, regional_lead, hub_ops: no tracker access
}

// Issue visibility. pickedByMe = the viewer picked this issue (audit_log).
// requester = the users_roles row of esc.email (for team scoping).
export function canView(user, esc, requester, pickedByMe = false) {
  if (!user || !esc) return false;
  if (user.role === 'admin') return true;
  if (esc.email === user.email) return true; // own issues, every role with tracker access
  if (user.role === 'team_lead') return sharesTeam(user, requester);
  if (user.role === 'cm_lead') return isMxRaised(requester) || isCmRaised(requester) || inCmPool(esc) || !!pickedByMe;
  if (user.role === 'cm_member') return !!pickedByMe || inCmPool(esc);
  return false; // requester and mx: own issues only. management, regional_lead, hub_ops: no tracker access
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
export function canPick(user, esc, requester) { return canEditOps(user, esc, requester) && !esc.issue_pick_time; }
export function canChangeZone(user) { return user?.role === 'admin'; }
export function canManageMasters(user) { return user?.role === 'admin'; }
export function canExport(user) { return !!user; }
