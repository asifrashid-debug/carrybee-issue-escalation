// IR analytics: pure rules (no network, no database). Used by GET /api/ir/analytics and tested in tests/irAnalytics.test.mjs.
// SLA rules match lib/irEscalation.mjs: pick clock stops only at Picked (set once), resolve clock stops at Resolved.
// Open issues past their target count as "overdue". Open issues inside it count as "pending".
// Picked was skipped (status moved on without Picked) counts as "skipped", not as a breach.
import { irResolveHours, irTargetsFromEnv, IR_MEMBERS, IR_STATUSES } from './irEscalation.mjs';
import { IR_KAM_STATUSES } from './irKamStatus.mjs';
import { dhakaDay, rangeDays } from './dateRange.js';

const HOUR = 3600e3;
const NOT_SET = 'Not set';
const NOT_ASSIGNED = 'Not assigned';

const hoursBetween = (fromIso, toMs) => (toMs - new Date(fromIso).getTime()) / HOUR;

// One SLA bucket for a row. doneIso = the stamp that stops the clock (picked or resolved).
export function classifyIrSla({ raisedIso, doneIso, targetHours, status, nowMs }) {
  if (doneIso) {
    if (targetHours == null) return 'none';
    return hoursBetween(raisedIso, new Date(doneIso).getTime()) <= targetHours ? 'within' : 'breached';
  }
  if (targetHours == null) return 'none';
  if (status && status !== 'Open') return 'skipped'; // pick only: status moved on without Picked
  return hoursBetween(raisedIso, nowMs) > targetHours ? 'overdue' : 'pending';
}

const LATE = new Set(['breached', 'overdue']);

const emptySla = () => ({ within: 0, breached: 0, overdue: 0, pending: 0, skipped: 0, none: 0 });

// rows: escalations with route_ir = true, already filtered by the caller (visibility, range, zone).
// range: { key, from, to } from lib/dateRange.js (controls the trend length and end day). null = All time.
export function buildIrAnalytics(rows = [], { now = new Date(), range = null, env = process.env } = {}) {
  const nowMs = now.getTime();
  const { pickHours } = irTargetsFromEnv(env);

  const pick = emptySla();
  const resolve = emptySla();
  const irStatusCount = Object.fromEntries(IR_STATUSES.map((s) => [s, 0]));
  const kamCount = Object.fromEntries([...IR_KAM_STATUSES, NOT_SET].map((s) => [s, 0]));
  const members = Object.fromEntries([...IR_MEMBERS, NOT_ASSIGNED].map((m) => [m, { name: m, assigned: 0, resolved: 0, open: 0, late: 0 }]));
  const cats = new Map();
  const dayCount = new Map();
  const pickHrs = [];
  const resolveHrs = [];
  let open = 0;
  let resolved = 0;
  let lateIssues = 0; // issues with any SLA breached or overdue (each issue counted once)

  for (const r of rows) {
    const status = r.ir_status || 'Open';
    const isResolved = status === 'Resolved';
    if (isResolved) resolved++; else open++;
    irStatusCount[status] = (irStatusCount[status] || 0) + 1;
    kamCount[r.ir_kam_status || NOT_SET] = (kamCount[r.ir_kam_status || NOT_SET] || 0) + 1;

    const pickBucket = classifyIrSla({ raisedIso: r.submitted_at, doneIso: r.ir_picked_at, targetHours: pickHours, status, nowMs });
    const resolveBucket = classifyIrSla({ raisedIso: r.submitted_at, doneIso: r.ir_resolved_at, targetHours: irResolveHours(r, env), status: null, nowMs });
    pick[pickBucket]++;
    resolve[resolveBucket]++;
    if (r.ir_picked_at) pickHrs.push(hoursBetween(r.submitted_at, new Date(r.ir_picked_at).getTime()));
    if (r.ir_resolved_at) resolveHrs.push(hoursBetween(r.submitted_at, new Date(r.ir_resolved_at).getTime()));

    const m = members[r.ir_assigned_member] || members[NOT_ASSIGNED];
    m.assigned++;
    if (isResolved) m.resolved++; else m.open++;
    const isLate = LATE.has(pickBucket) || LATE.has(resolveBucket);
    if (isLate) { m.late++; lateIssues++; }

    const cat = r.issue_category || NOT_SET;
    cats.set(cat, (cats.get(cat) || 0) + 1);
    const day = dhakaDay(new Date(r.submitted_at));
    dayCount.set(day, (dayCount.get(day) || 0) + 1);
  }

  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

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

  return {
    total: rows.length,
    open,
    resolved,
    pick_target_hours: pickHours,
    pick,
    resolve,
    late: lateIssues,
    avg_pick_hours: avg(pickHrs),
    avg_resolve_hours: avg(resolveHrs),
    ir_status: IR_STATUSES.map((s) => ({ label: s, value: irStatusCount[s] || 0 })),
    kam_status: [...IR_KAM_STATUSES, NOT_SET].map((s) => ({ label: s, value: kamCount[s] || 0 })),
    members: Object.values(members).filter((m) => m.name !== NOT_ASSIGNED || m.assigned > 0),
    categories: [...cats.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    trend: { labels, values },
  };
}
