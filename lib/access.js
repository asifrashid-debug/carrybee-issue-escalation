// Tab access by role. Pure module: used by the nav, the page guard in middleware, and tests.
// Roles come from users_roles (role). Team tags do not change tab access.
//   admin (super admin)              : every tab
//   team_lead, cm_lead               : Dashboard, Analytics, Tracker, HUB Performance, Team Performance, KAM Form
//   KAM / CM / Activation members    : Tracker, Team Performance, KAM Form
//                                      (requester, cm_member); CM members and CM lead also get Ops-KAM
//   mx                               : Tracker, IR Issues, Central Sort, TNL, Team Performance, MX Form, KAM Feedback
//                                      (the same KAM-OPS tabs as KAM members; they see only their own issues there)
//   KAM (requester, team_lead, mx)   : also Ops-KAM (own Ops Issues only)
//   CM (cm_member, cm_lead)          : also Ops-KAM (own Ops Issues plus the CM queue, read-only for the CM queue)
//   management, regional_lead, hub_ops: no tabs (no tracker access; hub responses come from the hub response sheet)

export const TABS = [
  { tab: 'overview', href: '/dashboard', label: 'Dashboard' },
  { tab: 'analytics', href: '/analytics', label: 'Analytics' },
  { tab: 'tracker', href: '/', label: 'Tracker' },
  { tab: 'ir_issues', href: '/ir', label: 'IR Issues' },
  { tab: 'central_sort', href: '/central-sort', label: 'Central Sort' },
  { tab: 'tnl', href: '/tnl', label: 'TNL' },
  { tab: 'hubs', href: '/hubs', label: 'HUB Performance' },
  { tab: 'teams', href: '/teams', label: 'Team Performance' },
  { tab: 'kam_form', href: '/kam/new', label: 'KAM Form' },
  { tab: 'kam_issues', href: '/kam/issues', label: 'OPS-KAM Tracker' },
  { tab: 'kam_analytics', href: '/kam/analytics', label: 'OPS-KAM Analytics' },
  { tab: 'mx_form', href: '/mx/new', label: 'MX Form' },
  { tab: 'admin', href: '/admin', label: 'Admin & Masters' },
  { tab: 'sync', href: '/sync', label: 'Sync Health' },
];

const ALL = TABS.map((t) => t.tab);
const TEAM_LEAD = ['overview', 'analytics', 'tracker', 'ir_issues', 'central_sort', 'tnl', 'hubs', 'teams', 'kam_form'];
const TEAM_MEMBER = ['tracker', 'ir_issues', 'central_sort', 'tnl', 'teams', 'kam_form'];
// MX members raise issues to HUB, IR, Central Sort or TNL, so they open the same KAM-OPS tabs (visibility is still own issues).
const MX_TABS = ['tracker', 'ir_issues', 'central_sort', 'tnl', 'teams', 'mx_form'];
// KAM Feedback: each KAM sees only the Ops Issues named to them (lib/opsIssues.mjs). Team leads and requesters are KAMs.
const KAM_TABS = ['kam_issues', 'kam_analytics'];

export const ROLE_TABS = {
  admin: ALL,
  team_lead: [...TEAM_LEAD, ...KAM_TABS],
  cm_lead: [...TEAM_LEAD, ...KAM_TABS],
  cm_member: [...TEAM_MEMBER, ...KAM_TABS],
  requester: [...TEAM_MEMBER, ...KAM_TABS],
  management: [],
  regional_lead: [],
  hub_ops: [],
  mx: [...MX_TABS, ...KAM_TABS],
};

export function tabsFor(role) {
  return ROLE_TABS[role] || [];
}

export function canOpenTab(role, tab) {
  return tabsFor(role).includes(tab);
}

export function navFor(role) {
  return TABS.filter((t) => canOpenTab(role, t.tab));
}

// Which tab a page path belongs to. '/' is the tracker; other pages match their path or a sub-path.
export function tabForPath(pathname) {
  if (pathname === '/') return 'tracker';
  const hit = TABS.find((t) => t.href !== '/' && (pathname === t.href || pathname.startsWith(t.href + '/')));
  return hit ? hit.tab : null;
}
