// RBAC per PRD permissions matrix (pilot: demo user selected from users_roles)
export function canView(user, esc) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'management') return true;
  if (user.role === 'requester') return true; // all read, filter to own in UI
  if (user.role === 'hub_ops') return esc.zone === user.zone;
  if (user.role === 'regional_lead') return esc.zone === user.zone || user.region === esc.division;
  return false;
}
export function canEditRequesterPrePick(user, esc) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'requester' && esc.email === user.email && !esc.issue_pick_time) return true;
  return false;
}
export function canEditRequesterPostPick(user, esc) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'requester' && esc.email === user.email) return true; // only KAM Feedback + Issue Status enforced in API
  return false;
}
export function canEditOps(user, esc) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'hub_ops' && esc.zone === user.zone) return true;
  if (user.role === 'regional_lead' && (esc.zone === user.zone || user.region === esc.division)) return true;
  return false;
}
export function canPick(user, esc) { return canEditOps(user, esc) && !esc.issue_pick_time; }
export function canChangeZone(user) { return user?.role === 'admin'; }
export function canManageMasters(user) { return user?.role === 'admin'; }
export function canExport(user) { return !!user; }
