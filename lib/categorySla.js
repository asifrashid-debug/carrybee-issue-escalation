// Category SLA: resolution deadline per issue category, sub category and zone.
// Source: category_master (requester side, active rows), columns sla_isd / sla_osd / sla_ctg.
// Unit: DAYS from the time the issue was raised (submitted_at). Pure functions, no I/O.
// If a category has no SLA for the zone, the issue falls back to the default 72 hours (3 days).

export const DEFAULT_RESOLUTION_HOURS = 72;
const H = 3600e3;
const ZONE_COLUMN = { ISD: 'sla_isd', OSD: 'sla_osd', CTG: 'sla_ctg' };

const keyOf = (category, sub) => `${String(category || '').trim()}\u0001${String(sub || '').trim()}`;

// Build a lookup from category_master rows (or data/categories.json rows, same field names).
export function indexCategories(rows = []) {
  const m = new Map();
  for (const r of rows) {
    if (r.side && r.side !== 'requester') continue;
    if (r.is_active === false) continue;
    m.set(keyOf(r.category, r.sub_category), r);
  }
  return m;
}

// SLA days for one issue. Returns { days, hours, source } where source is 'category' or 'default'.
export function resolutionSla(index, { issue_category, issue_sub_category, zone }) {
  const row = index?.get(keyOf(issue_category, issue_sub_category));
  const col = ZONE_COLUMN[zone];
  const n = row && col ? Number(row[col]) : NaN;
  if (Number.isFinite(n) && n > 0) return { days: n, hours: n * 24, source: 'category' };
  return { days: DEFAULT_RESOLUTION_HOURS / 24, hours: DEFAULT_RESOLUTION_HOURS, source: 'default' };
}

// Resolution check for one issue at time nowMs.
// An issue is open for resolution when it is not Closed and its ops status is not Resolved.
export function resolutionCheck(e, index, nowMs = Date.now()) {
  const sla = resolutionSla(index, e);
  const raised = new Date(e.submitted_at).getTime();
  const dueMs = raised + sla.hours * H;
  const open = e.issue_status !== 'Closed' && e.ops_issue_status !== 'Resolved';
  const breach = open && nowMs > dueMs;
  return {
    days: sla.days,
    source: sla.source,
    dueAt: new Date(dueMs).toISOString(),
    open,
    breach,
    overdueH: breach ? (nowMs - dueMs) / H : 0,
  };
}
