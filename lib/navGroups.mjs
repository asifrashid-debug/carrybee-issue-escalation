// Sidebar navigation groups. Pure: used by components/SideNav.js and tests/navGroups.test.mjs.
// Pages keep their hrefs (lib/access.js). Only the menu changes:
//   Dashboard                      : its own item
//   Reporting                      : Analytics, HUB Performance, Team Performance (flyout)
//   KAM-OPS Tracker                : Tracker, IR Issues, Central Sort, TNL (flyout)
//   OPS-KAM Tracker                : Tracker, Analytics (flyout)
//   KAM Form, MX Form              : their own items
//   Admin & Masters, Sync Health   : their own items
// Role rules stay in lib/access.js. A group only shows the pages the viewer may open, and is hidden when none are left.

export const TAB_ICON = {
  overview: 'zone', analytics: 'trend', tracker: 'escalation', hubs: 'hub', teams: 'team', kam_form: 'kam',
  mx_form: 'mx', admin: 'layers', sync: 'sync', ir_issues: 'ir', central_sort: 'hub', tnl: 'truck', kam_issues: 'shield', kam_analytics: 'trend',
};

export const NAV_GROUPS = [
  { key: 'dashboard', tab: 'overview' },
  { key: 'reporting', label: 'Reporting', icon: 'trend', tabs: ['analytics', 'hubs', 'teams'] },
  { key: 'ops', label: 'KAM-OPS Tracker', icon: 'target', tabs: ['tracker', 'ir_issues', 'central_sort', 'tnl'] },
  { key: 'kam_issues', label: 'OPS-KAM Tracker', icon: 'shield', tabs: ['kam_issues', 'kam_analytics'], itemLabels: { kam_issues: 'Tracker', kam_analytics: 'Analytics' } },
  { key: 'kam_form', tab: 'kam_form' },
  { key: 'mx_form', tab: 'mx_form' },
  { key: 'admin', tab: 'admin' },
  { key: 'sync', tab: 'sync' },
];

// links: the viewer's pages from navFor(role), each { tab, href, label }.
// Returns the menu in order: link items { type: 'link', key, tab, href, label, icon } and
// group items { type: 'group', key, label, icon, items: [{ tab, href, label }] }.
export function buildSideNav(links = []) {
  const byTab = new Map(links.map((l) => [l.tab, l]));
  const out = [];
  for (const g of NAV_GROUPS) {
    if (g.tab) {
      const link = byTab.get(g.tab);
      if (link) out.push({ type: 'link', key: g.key, tab: link.tab, href: link.href, label: link.label, icon: TAB_ICON[link.tab] || 'escalation' });
    } else {
      const items = g.tabs.map((t) => byTab.get(t)).filter(Boolean).map((l) => ({ tab: l.tab, href: l.href, label: g.itemLabels?.[l.tab] || l.label }));
      if (items.length) out.push({ type: 'group', key: g.key, label: g.label, icon: g.icon, items });
    }
  }
  return out;
}
