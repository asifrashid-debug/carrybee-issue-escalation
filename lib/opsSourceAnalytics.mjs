// Ops-KAM analytics for one source tab (HUB, IR, Sort, TNL): pure rules, no network or database.
// Used by GET /api/kam/analytics and tests/opsSourceAnalytics.test.mjs. Same layout as lib/routeAnalytics.mjs.
// Input rows are ops_issues rows (visible to the viewer, already filtered to the source and the date range).
// Open = not Resolved or Not Resolved. Past target = lib/opsLifecycle.mjs dueState().overdue, the same rule as the Overdue count on the OPS-KAM page.
import { dueState, CLOSED_STATUSES, STATUSES, VALIDATIONS } from './opsLifecycle.mjs';
import { OPS_SOURCE_TABS } from './opsIssues.mjs';
import { dhakaDay, rangeDays } from './dateRange.js';

const HOUR = 3600e3;
const NOT_SET = 'Not set';

export const SOURCE_LABEL = Object.fromEntries(OPS_SOURCE_TABS.map((t) => [t.key, t.label.replace(' Issues', '')]));

function bump(map, key, isOpen, isLate) {
  const v = map.get(key) || { label: key, total: 0, open: 0, late: 0 };
  v.total++;
  if (isOpen) v.open++;
  if (isLate) v.late++;
  map.set(key, v);
}

export function buildOpsSourceAnalytics(rows = [], { source, now = new Date(), range = null } = {}) {
  const nowMs = now.getTime();
  const statusCount = Object.fromEntries([...STATUSES, NOT_SET].map((s) => [s, 0]));
  const valCount = Object.fromEntries([...VALIDATIONS, NOT_SET].map((s) => [s, 0]));
  const zones = new Map();
  const hubs = new Map();
  const cats = new Map();
  const dayCount = new Map();
  const sla = { closed: 0, pending: 0, breached: 0 };
  let open = 0;
  let late = 0;
  let feedback = 0;

  for (const r of rows) {
    const isOpen = !CLOSED_STATUSES.includes(r.issue_status);
    const isLate = isOpen && dueState(r, now).overdue;
    if (isOpen) open++;
    if (isLate) late++;
    if (!isOpen) sla.closed++; else if (isLate) sla.breached++; else sla.pending++;
    if (String(r.kam_feedback ?? '').trim() !== '') feedback++;

    const st = r.issue_status || NOT_SET;
    statusCount[st] = (statusCount[st] || 0) + 1;
    const val = r.validation || NOT_SET;
    valCount[val] = (valCount[val] || 0) + 1;

    bump(zones, r.zone || NOT_SET, isOpen, isLate);
    bump(hubs, r.hub_name || NOT_SET, isOpen, isLate);
    bump(cats, r.issue_category || NOT_SET, isOpen, isLate);

    const raised = Date.parse(r.raised_at);
    if (!Number.isNaN(raised)) {
      const day = dhakaDay(new Date(raised));
      dayCount.set(day, (dayCount.get(day) || 0) + 1);
    }
  }

  // Trend: one point per Dhaka day, ending at the range end (or today), covering the range (14 days for All time).
  const days = rangeDays(range, nowMs);
  const end = range?.to || dhakaDay(now);
  const endMs = Date.parse(`${end}T00:00:00+06:00`);
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dhakaDay(new Date(endMs - i * 86400000 + 12 * HOUR));
    labels.push(key.slice(5));
    values.push(dayCount.get(key) || 0);
  }

  const byTotal = (a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label));
  return {
    source,
    label: SOURCE_LABEL[source] || source,
    total: rows.length,
    open,
    closed: rows.length - open,
    late,
    feedback_added: feedback,
    sla,
    status: [...STATUSES, NOT_SET].map((s) => ({ label: s, value: statusCount[s] || 0 })),
    validation: [...VALIDATIONS, NOT_SET].map((s) => ({ label: s, value: valCount[s] || 0 })),
    zones: [...zones.values()].sort(byTotal),
    hubs: [...hubs.values()].sort(byTotal).slice(0, 10),
    categories: [...cats.values()].sort(byTotal).slice(0, 8),
    trend: { labels, values },
  };
}
