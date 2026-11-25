// Ops-KAM analytics: numbers for the Analytics page, computed from Ops Issues (public.ops_issues).
// Pure: no DB or network. The route (app/api/analytics/route.js) loads the rows and passes them in.
//
// Windows and clocks come from lib/opsLifecycle.mjs: pick within 30 min of Raised, close within 24 h of Raised.
// Per-KAM figures are returned for every viewer; the route keeps them only for admin.

import { STATUSES, CLOSED_STATUSES, VALIDATIONS, PICK_WINDOW_OFFICE_H, RESOLVE_WINDOW_H, dueState } from './opsLifecycle.mjs';
import { dhakaDay } from './dateRange.js';

const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const ms = (t) => (t == null || t === '' ? null : new Date(t).getTime());
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// issues: ops_issues rows (raised in the range). days: trend length. zoneOf(sheetId) -> 'ISD' | 'OSD' | 'CTG' | null.
export function computeOpsKam({ issues = [], now = new Date(), days = 14, zoneOf = () => null }) {
  const rows = issues.filter((i) => ms(i.raised_at) != null);
  const nowMs = now.getTime();

  const counts = { total: rows.length, open: 0, toPick: 0, overdue: 0, closed: 0, validated: 0 };
  const pickMins = [];
  const closeHours = [];
  let pickMet = 0; let pickDone = 0;
  let closeMet = 0; let closeDone = 0;
  const statusCount = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const validationCount = Object.fromEntries([...VALIDATIONS, 'Not validated'].map((v) => [v, 0]));
  const zoneRows = new Map();
  const categoryCount = new Map();
  const kamRows = new Map();

  for (const i of rows) {
    const raised = ms(i.raised_at);
    const due = dueState(i, now);
    const open = !CLOSED_STATUSES.includes(i.issue_status);
    if (open) counts.open++;
    if (i.issue_status === 'Raised') counts.toPick++;
    if (due.overdue) counts.overdue++;
    if (CLOSED_STATUSES.includes(i.issue_status)) counts.closed++;
    if (i.validated_at) counts.validated++;
    if (Object.prototype.hasOwnProperty.call(statusCount, i.issue_status)) statusCount[i.issue_status]++;
    const v = i.validation && Object.prototype.hasOwnProperty.call(validationCount, i.validation) ? i.validation : 'Not validated';
    validationCount[v]++;

    const picked = ms(i.picked_at);
    const pickDue = ms(i.pick_due_at);
    if (picked != null) {
      pickDone++;
      pickMins.push((picked - raised) / MIN);
      if (picked <= pickDue) pickMet++;
    }
    const closed = ms(i.closed_at);
    if (closed != null) {
      closeDone++;
      closeHours.push((closed - raised) / HOUR);
      if (closed - raised <= RESOLVE_WINDOW_H * HOUR) closeMet++;
    }

    const zone = zoneOf(i.sheet_spreadsheet_id) || 'Unknown';
    if (!zoneRows.has(zone)) zoneRows.set(zone, { zone, total: 0, open: 0, overdue: 0, pickDone: 0, pickMet: 0 });
    const z = zoneRows.get(zone);
    z.total++; if (open) z.open++; if (due.overdue) z.overdue++;
    if (picked != null) { z.pickDone++; if (picked <= pickDue) z.pickMet++; }

    const cat = (i.issue_category || '').trim() || 'Not categorised';
    categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);

    const kam = (i.kam_name || '').trim() || 'No KAM';
    if (!kamRows.has(kam)) kamRows.set(kam, { kam, total: 0, open: 0, overdue: 0, pickDone: 0, pickMet: 0, closeDone: 0, closeMet: 0, validated: 0 });
    const k = kamRows.get(kam);
    k.total++; if (open) k.open++; if (due.overdue) k.overdue++; if (i.validated_at) k.validated++;
    if (picked != null) { k.pickDone++; if (picked <= pickDue) k.pickMet++; }
    if (closed != null) { k.closeDone++; if (closed - raised <= RESOLVE_WINDOW_H * HOUR) k.closeMet++; }
  }

  // Daily trend: raised and closed per Dhaka day, last `days` days ending today.
  const raisedBy = new Map();
  const closedBy = new Map();
  for (const i of rows) {
    const r = dhakaDay(new Date(ms(i.raised_at)));
    raisedBy.set(r, (raisedBy.get(r) || 0) + 1);
    if (ms(i.closed_at) != null) {
      const c = dhakaDay(new Date(ms(i.closed_at)));
      closedBy.set(c, (closedBy.get(c) || 0) + 1);
    }
  }
  const trend = [];
  for (let n = days - 1; n >= 0; n--) {
    const day = dhakaDay(new Date(nowMs - n * DAY));
    trend.push({ date: day, raised: raisedBy.get(day) || 0, closed: closedBy.get(day) || 0 });
  }

  const zones = [...zoneRows.values()]
    .map((z) => ({ zone: z.zone, total: z.total, open: z.open, overdue: z.overdue, pickOnTimePct: pct(z.pickMet, z.pickDone) }))
    .sort((a, b) => b.total - a.total);

  const categories = [...categoryCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const kams = [...kamRows.values()]
    .map((k) => ({
      kam: k.kam, total: k.total, open: k.open, overdue: k.overdue,
      pickOnTimePct: pct(k.pickMet, k.pickDone),
      closeOnTimePct: pct(k.closeMet, k.closeDone),
      validatedPct: pct(k.validated, k.total),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    ...counts,
    pickOnTimePct: pct(pickMet, pickDone),
    closeOnTimePct: pct(closeMet, closeDone),
    validatedPct: pct(counts.validated, counts.total),
    medianPickMinutes: median(pickMins) == null ? null : Math.round(median(pickMins)),
    medianCloseHours: median(closeHours) == null ? null : Math.round(median(closeHours) * 10) / 10,
    pickWindowOfficeH: PICK_WINDOW_OFFICE_H,
    closeWindowH: RESOLVE_WINDOW_H,
    statuses: STATUSES.map((s) => ({ label: s, count: statusCount[s] })),
    validations: [...VALIDATIONS, 'Not validated'].map((v) => ({ label: v, count: validationCount[v] })),
    zones,
    categories,
    trend,
    kams,
  };
}

// Strips per-KAM detail for viewers who may not see it (only admin keeps it).
export function forViewer(result, role) {
  if (role === 'admin') return result;
  const { kams, ...rest } = result;
  return rest;
}
