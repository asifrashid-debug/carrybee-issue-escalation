// Tab access by role. Pure module: used by the nav, the page guard in middleware, and tests.
// Roles come from users_roles (role). Team tags do not change tab access.
//   admin (super admin)              : every tab
//   team_lead, cm_lead               : Dashboard, Analytics, Tracker, HUB Performance, Team Performance, KAM Form
//   KAM / CM / Activation members    : Tracker, Team Performance, KAM Form
//                                      (requester, cm_member)
//   mx                               : Tracker, Team Performance, MX Form
//   management, regional_lead, hub_ops: no tabs (no tracker access; hub responses come from the hub response sheet)

export const TABS = [
  { tab: 'overview', href: '/dashboard', label: 'Dashboard' },
  { tab: 'analytics', href: '/analytics', label: 'Analytics' },
  { tab: 'tracker', href: '/', label: 'Tracker' },
  { tab: 'hubs', href: '/hubs', label: 'HUB Performance' },
  { tab: 'teams', href: '/teams', label: 'Team Performance' },
  { tab: 'kam_form', href: '/kam/new', label: 'KAM Form' },
  { tab: 'mx_form', href: '/mx/new', label: 'MX Form' },
  { tab: 'admin', href: '/admin', label: 'Admin & Masters' },
  { tab: 'sync', href: '/sync', label: 'Sync Health' },
];

const ALL = TABS.map((t) => t.tab);
const TEAM_LEAD = ['overview', 'analytics', 'tracker', 'hubs', 'teams', 'kam_form'];
const TEAM_MEMBER = ['tracker', 'teams', 'kam_form'];

export const ROLE_TABS = {
  admin: ALL,
  team_lead: TEAM_LEAD,
  cm_lead: TEAM_LEAD,
  cm_member: TEAM_MEMBER,
  requester: TEAM_MEMBER,
  management: [],
  regional_lead: [],
  hub_ops: [],
  mx: ['tracker', 'teams', 'mx_form'],
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
