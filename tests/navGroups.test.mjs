import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSideNav, NAV_GROUPS } from '../lib/navGroups.mjs';
import { TABS, navFor } from '../lib/access.js';

const flat = (menu) => menu.flatMap((m) => (m.type === 'group' ? m.items.map((i) => i.tab) : [m.tab]));

test('every page in the tab list is placed in the sidebar exactly once', () => {
  const placed = NAV_GROUPS.flatMap((g) => (g.tab ? [g.tab] : g.tabs));
  assert.deepEqual([...placed].sort(), TABS.map((t) => t.tab).sort());
  assert.equal(new Set(placed).size, placed.length);
});

test('admin sees every page, in the requested order', () => {
  const menu = buildSideNav(navFor('admin'));
  assert.deepEqual(menu.map((m) => m.label), ['Dashboard', 'Reporting', 'KAM-OPS Tracker', 'OPS-KAM Tracker', 'KAM Form', 'MX Form', 'Admin & Masters', 'Sync Health']);
  assert.deepEqual(menu[1].items.map((i) => i.label), ['Analytics', 'HUB Performance', 'Team Performance']);
  assert.deepEqual(menu[2].items.map((i) => i.label), ['Tracker', 'IR Issues', 'Central Sort', 'TNL']);
  assert.equal(menu[3].type, 'link');
  assert.equal(menu[3].href, '/kam/issues');
  assert.equal(flat(menu).length, TABS.length);
});

test('dashboard is its own item and links to /dashboard', () => {
  const menu = buildSideNav(navFor('admin'));
  assert.deepEqual({ type: menu[0].type, tab: menu[0].tab, href: menu[0].href }, { type: 'link', tab: 'overview', href: '/dashboard' });
});

test('a group is hidden when the viewer may open none of its pages', () => {
  // mx may open Tracker, Team Performance, MX Form and Ops-KAM only: Reporting keeps Team Performance, Dashboard is gone.
  const menu = buildSideNav(navFor('mx'));
  const reporting = menu.find((m) => m.key === 'reporting');
  assert.deepEqual(reporting.items.map((i) => i.tab), ['teams']);
  assert.ok(!menu.some((m) => m.type === 'link' && m.tab === 'overview'));
  assert.ok(!menu.some((m) => m.type === 'link' && m.tab === 'sync'));
});

test('no viewer rights means an empty menu', () => {
  assert.deepEqual(buildSideNav(navFor('management')), []);
});
