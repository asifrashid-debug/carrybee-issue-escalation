// Central Sort and TNL analytics: pure rules (no network, no database). Used by GET /api/route-analytics
// and tested in tests/routeAnalytics.test.mjs. Same layout as the IR analytics (lib/irAnalytics.mjs).
// Open and past-target use the same resolution rule as the list (lib/categorySla.js resolutionCheck):
//   target = category SLA days from the raised time; open = not Closed and ops issue status not Resolved.
// Ops Status and Validation come from the Ops tracker sync-back (escalations.ops_status, escalations.validation).
import { resolutionCheck } from './categorySla.js';
import { dhakaDay, rangeDays } from './dateRange.js';

const HOUR = 3600e3;
const NOT_SET = 'Not set';

export const ROUTE_LABEL = { central_sort: 'Central Sort', tnl: 'TNL' };
// The escalations column holding each route's sheet row. Null means the issue is not on that response sheet yet.
export const ROUTE_SHEET_ROW = { central_sort: 'central_sort_sheet_row', tnl: 'tnl_sheet_row' };
export const OPS_STATUSES = ['New', 'Picked', 'In Progress', 'On Hold', 'Resolved', 'Unresolved'];

function bump(map, key, isOpen, isLate) {
  const v = map.get(key) || { label: key, total: 0, open: 0, late: 0 };
  v.total++;
  if (isOpen) v.open++;
  if (isLate) v.late++;
  map.set(key, v);
  return v;
}

// rows: escalations with the route flag = true, already filtered by the caller (visibility, range, zone).
// catIndex: lookup from indexCategories(category_master rows). Empty = every issue uses the default target.
export function buildRouteAnalytics(rows = [], { route, now = new Date(), range = null, catIndex = new Map() } = {}) {
  const nowMs = now.getTime();
  const sheetCol = ROUTE_SHEET_ROW[route];
  const opsCount = Object.fromEntries([...OPS_STATUSES, NOT_SET].map((s) => [s, 0]));
  const valCount = new Map();
  const zones = new Map();
  const hubs = new Map();
  const cats = new Map();
  const dayCount = new Map();
  const sla = { closed: 0, pending: 0, breached: 0 };
  let open = 0;
  let late = 0;
  let notOnSheet = 0;

  for (const r of rows) {
    const c = resolutionCheck(r, catIndex, nowMs);
    const isOpen = c.open;
    const isLate = c.breach;
    if (isOpen) open++;
    if (isLate) late++;
    if (!isOpen) sla.closed++; else if (isLate) sla.breached++; else sla.pending++;
    if (sheetCol && !r[sheetCol]) notOnSheet++;

    const ops = r.ops_status || NOT_SET;
    opsCount[ops] = (opsCount[ops] || 0) + 1;
    const val = r.validation || NOT_SET;
    valCount.set(val, (valCount.get(val) || 0) + 1);

    bump(zones, r.zone || NOT_SET, isOpen, isLate);
    bump(hubs, r.concern_hub || NOT_SET, isOpen, isLate);
    bump(cats, r.issue_category || NOT_SET, isOpen, isLate);
    const day = dhakaDay(new Date(r.submitted_at));
    dayCount.set(day, (dayCount.get(day) || 0) + 1);
  }

  // Trend: one point per Dhaka day, ending at the range end (or today), covering the range (14 days for All time).
  const days = rangeDays(range, nowMs);
  const end = range?.to || dhakaDay(now);
  const endMs = Date.parse(`${end}T00:00:00+06:00`);
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dhakaDay(new Date(endMs - i * 86400000 + 12 * HOUR)); // noon Dhaka of that day, so the day never drifts
    labels.push(key.slice(5));
    values.push(dayCount.get(key) || 0);
  }

  const byTotal = (a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label));
  return {
    route,
    label: ROUTE_LABEL[route] || route,
    total: rows.length,
    open,
    closed: rows.length - open,
    late,
    not_on_sheet: notOnSheet,
    sla,
    ops_status: [...OPS_STATUSES, NOT_SET].map((s) => ({ label: s, value: opsCount[s] || 0 })),
    validation: [...valCount.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    zones: [...zones.values()].sort(byTotal),
    hubs: [...hubs.values()].sort(byTotal).slice(0, 10),
    categories: [...cats.values()].sort(byTotal).slice(0, 8),
    trend: { labels, values },
  };
}
