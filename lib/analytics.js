// Pure analytics for Dashboard / Analytics / HUB Performance / Team Performance.
// Input: escalation rows, users_roles rows, hub_master rows. No I/O here.

import { indexCategories, resolutionCheck, DEFAULT_RESOLUTION_HOURS } from './categorySla.js';
import { FEEDBACK_OUTCOMES } from './feedback.js';

// Spec: first comment within 2h of being raised (breach past 2h). Pick 4h kept as an informational metric.
// Resolution: per category, sub category and zone (days, see lib/categorySla.js). 72h is the default when none is set.
export const SLA = { pickHours: 4, responseHours: 2, resolutionHours: DEFAULT_RESOLUTION_HOURS };
const TZ = 'Asia/Dhaka';
const ZONES = ['ISD', 'OSD', 'CTG'];

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;
const round1 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10) / 10);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ISO-8601 week label such as "2026 W46", using the Dhaka wall clock (fixed +06:00).
export function isoWeekKey(date) {
  const d = new Date(new Date(date).getTime() + 6 * 3600000);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const doy = Math.floor((thu - Date.UTC(thu.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  return `${thu.getUTCFullYear()} W${String(Math.ceil(doy / 7)).padStart(2, '0')}`;
}

export function dhakaDay(date) {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}

function countBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r) || 'Unspecified';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function computeAnalytics({ escalations = [], users = [], hubs = [], categories = [], now = new Date(), days = 14, sla = SLA }) {
  const rows = escalations.filter((e) => !e.is_archived);
  const nowMs = new Date(now).getTime();
  const isOpen = (e) => e.issue_status !== 'Closed';
  const isResolved = (e) => e.ops_issue_status === 'Resolved';
  const hubInfo = new Map(hubs.map((h) => [h.hub_name, h]));
  const pickH = rows.filter((e) => e.issue_pick_time).map((e) => hoursBetween(e.submitted_at, e.issue_pick_time));
  const respH = rows.filter((e) => e.issue_response_datetime).map((e) => hoursBetween(e.submitted_at, e.issue_response_datetime));
  // Spec SLA breach: open issue with no first comment (issue_response_datetime) more than 2h after being raised.
  const breachRow = (e) =>
    isOpen(e) && !e.issue_response_datetime && hoursBetween(e.submitted_at, nowMs) > sla.responseHours;
  // Resolution breach: open past the category SLA days for the issue's zone (lib/categorySla.js).
  const catIndex = indexCategories(categories);
  const resCheck = (e) => resolutionCheck(e, catIndex, nowMs);
  const resBreach = (e) => resCheck(e).breach;
  // Any breach counts everywhere: no first comment in time, or resolution past the category SLA.
  const anyBreach = (e) => breachRow(e) || resBreach(e);

  // First-comment SLA share. Denominator = issues that have a first comment + open breaches
  // (raised more than responseHours ago with no comment). Awaiting issues still inside the window are excluded.
  const responseShare = (list) => {
    const responded = list.filter((e) => e.issue_response_datetime);
    const ok = responded.filter((e) => hoursBetween(e.submitted_at, e.issue_response_datetime) <= sla.responseHours).length;
    return pct(ok, responded.length + list.filter(breachRow).length);
  };

  const kpi = {
    total: rows.length,
    open: rows.filter(isOpen).length,
    unpicked: rows.filter((e) => !e.issue_pick_time).length,
    awaitingResponse: rows.filter((e) => isOpen(e) && !e.issue_response_datetime).length,
    resolved: rows.filter(isResolved).length,
    p1Open: rows.filter((e) => e.priority_scale === 'P1' && isOpen(e)).length,
    breaches: rows.filter(anyBreach).length,
    commentBreaches: rows.filter(breachRow).length,
    resolutionBreaches: rows.filter(resBreach).length,
    resolvedPct: pct(rows.filter(isResolved).length, rows.length),
    medianPickHours: round1(median(pickH)),
    pickSlaPct: pct(pickH.filter((h) => h <= sla.pickHours).length, pickH.length),
    medianResponseHours: round1(median(respH)),
    responseSlaPct: responseShare(rows),
    picked: rows.filter((e) => e.issue_pick_time).length,
    responded: rows.filter((e) => e.issue_response_datetime).length,
    closed: rows.filter((e) => e.issue_status === 'Closed').length,
    olderThan2d: rows.filter((e) => isOpen(e) && hoursBetween(e.submitted_at, nowMs) > 48).length,
    p2Open: rows.filter((e) => e.priority_scale === 'P2' && isOpen(e)).length,
  };

  const zones = ZONES.map((z) => {
    const zr = rows.filter((e) => e.zone === z);
    const zrh = zr.filter((e) => e.issue_response_datetime).map((e) => hoursBetween(e.submitted_at, e.issue_response_datetime));
    return {
      zone: z, total: zr.length, open: zr.filter(isOpen).length, resolved: zr.filter(isResolved).length,
      p1Open: zr.filter((e) => e.priority_scale === 'P1' && isOpen(e)).length,
      breaches: zr.filter(anyBreach).length,
      resolutionBreaches: zr.filter(resBreach).length,
      responseSlaPct: responseShare(zr),
      medianResponseHours: round1(median(zrh)),
    };
  });

  // Priority mix: all issues and open issues per priority scale (P1 to P4).
  const priorities = ['P1', 'P2', 'P3', 'P4'].map((p) => ({
    label: p,
    total: rows.filter((e) => e.priority_scale === p).length,
    open: rows.filter((e) => e.priority_scale === p && isOpen(e)).length,
  }));

  // Daily trend (Dhaka days), last `days` days ending today.
  const trend = [];
  const todayMs = nowMs;
  for (let i = days - 1; i >= 0; i--) {
    const day = dhakaDay(todayMs - i * 86400000);
    const dayRows = rows.filter((e) => dhakaDay(e.submitted_at) === day);
    trend.push({
      date: day,
      submitted: dayRows.length,
      picked: dayRows.filter((e) => e.issue_pick_time).length,
      responded: dayRows.filter((e) => e.issue_response_datetime).length,
    });
  }

  // Hub performance
  const hubMap = new Map();
  for (const e of rows) {
    const key = e.concern_hub || 'Unspecified';
    if (!hubMap.has(key)) hubMap.set(key, []);
    hubMap.get(key).push(e);
  }
  const hubPerf = [...hubMap.entries()].map(([hub, hr]) => {
    const info = hubInfo.get(hub) || {};
    const rh = hr.filter((e) => e.issue_response_datetime).map((e) => hoursBetween(e.submitted_at, e.issue_response_datetime));
    return {
      hub,
      zone: info.zone || hr[0]?.zone || null,
      division: info.division || hr[0]?.division || null,
      regionalLead: info.regional_lead || hr[0]?.regional_lead || null,
      total: hr.length,
      open: hr.filter(isOpen).length,
      resolved: hr.filter(isResolved).length,
      resolvedPct: pct(hr.filter(isResolved).length, hr.length),
      p1Open: hr.filter((e) => e.priority_scale === 'P1' && isOpen(e)).length,
      medianResponseHours: round1(median(rh)),
      responseSlaPct: responseShare(hr),
      breaches: hr.filter(anyBreach).length,
    };
  }).sort((a, b) => b.total - a.total || a.hub.localeCompare(b.hub));

  // Team performance: a team's issues = issues raised by members whose users_roles.teams includes it.
  const teamNames = [...new Set(users.flatMap((u) => u.teams || []))].sort();
  const emailTeams = new Map(users.map((u) => [u.email, u.teams || []]));
  // Weekly submissions for the last two ISO weeks (previous week, current week), Dhaka time.
  const weeks = [isoWeekKey(nowMs - 7 * 86400000), isoWeekKey(nowMs)];
  const teams = teamNames.map((t) => {
    const members = users.filter((u) => (u.teams || []).includes(t));
    const memberEmails = new Set(members.map((m) => m.email));
    const tr = rows.filter((e) => memberEmails.has(e.email));
    const weekly = weeks.map((w) => tr.filter((e) => isoWeekKey(e.submitted_at) === w).length);
    const rh = tr.filter((e) => e.issue_response_datetime).map((e) => hoursBetween(e.submitted_at, e.issue_response_datetime));
    const lead = users.find((u) => u.role === 'team_lead' && (u.teams || []).includes(t));
    const cmLead = users.find((u) => u.role === 'cm_lead' && (u.teams || []).includes(t));
    return {
      team: t,
      lead: (lead || cmLead)?.display_name || null,
      members: members.length,
      issues: tr.length,
      open: tr.filter(isOpen).length,
      resolved: tr.filter(isResolved).length,
      resolvedPct: pct(tr.filter(isResolved).length, tr.length),
      p1Open: tr.filter((e) => e.priority_scale === 'P1' && isOpen(e)).length,
      medianResponseHours: round1(median(rh)),
      responseSlaPct: responseShare(tr),
      breaches: tr.filter(anyBreach).length,
      unpicked: tr.filter((e) => isOpen(e) && !e.issue_pick_time).length,
      issuesPerMember: members.length ? round1(tr.length / members.length) : null,
      weekly,
      // Per ISO week (previous, current): volume, resolved and first-comment share. Used for improving/lagging.
      weeklyDetail: weeks.map((w) => {
        const wr = tr.filter((e) => isoWeekKey(e.submitted_at) === w);
        return { week: w, issues: wr.length, resolved: wr.filter(isResolved).length, resolvedPct: pct(wr.filter(isResolved).length, wr.length), responseSlaPct: responseShare(wr) };
      }),
      // Individual performance: issues each member raised (by raiser email), most issues first.
      people: members.map((m) => {
        const mr = tr.filter((e) => e.email === m.email);
        const res = mr.filter(isResolved).length;
        return {
          email: m.email, name: m.display_name || m.email, role: m.role,
          issues: mr.length, open: mr.filter(isOpen).length, resolved: res, resolvedPct: pct(res, mr.length),
          responseSlaPct: responseShare(mr), breaches: mr.filter(anyBreach).length,
          p1Open: mr.filter((e) => e.priority_scale === 'P1' && isOpen(e)).length,
          unpicked: mr.filter((e) => isOpen(e) && !e.issue_pick_time).length,
        };
      }).sort((a, b) => b.issues - a.issues || a.name.localeCompare(b.name)),
    };
  }).sort((a, b) => b.issues - a.issues);
  const unmapped = rows.filter((e) => !emailTeams.has(e.email)).length;

  // Exception list: open issues past pick or response SLA, most urgent first (P1 before P4, then most overdue).
  const PRI = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const attentionAll = rows.filter(anyBreach).map((e) => {
    const ageH = hoursBetween(e.submitted_at, nowMs);
    const picked = !!e.issue_pick_time;
    const comment = breachRow(e);
    const res = resCheck(e);
    return {
      issue_id: e.issue_id, zone: e.zone, concern_hub: e.concern_hub, issue_category: e.issue_category,
      priority_scale: e.priority_scale || null, channel: e.channel || null,
      kind: comment ? 'No comment' : 'Resolution overdue',
      ageH: round1(ageH), overdueH: round1(comment ? ageH - sla.responseHours : res.overdueH),
      slaDays: res.days,
      nextAction: comment ? (picked ? 'CM followup due' : 'Hub incharge to pick and comment') : 'Resolve or update ops status',
    };
  }).sort((a, b) => (PRI[a.priority_scale] ?? 9) - (PRI[b.priority_scale] ?? 9) || b.overdueH - a.overdueH);
  const attention = attentionAll.slice(0, 8);
  const attentionTotal = attentionAll.length;

  const recent = [...rows]
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 10)
    .map((e) => ({ issue_id: e.issue_id, submitted_at: e.submitted_at, zone: e.zone, concern_hub: e.concern_hub, issue_category: e.issue_category, priority_scale: e.priority_scale, issue_status: e.issue_status, ops_issue_status: e.ops_issue_status, channel: e.channel }));

  // Ageing of open cases: whole days since submission. 0–1 day = under 2 days; 2–4 days = 2 to under 5; 5+ days = 5 or more.
  const openDays = (e) => Math.floor(hoursBetween(e.submitted_at, nowMs) / 24);
  const ageing = [
    { label: '0–1 day', count: rows.filter((e) => isOpen(e) && openDays(e) < 2).length },
    { label: '2–4 days', count: rows.filter((e) => isOpen(e) && openDays(e) >= 2 && openDays(e) < 5).length },
    { label: '5+ days', count: rows.filter((e) => isOpen(e) && openDays(e) >= 5).length },
  ];

  // Feedback outcomes: share of closed cases by KAM feedback result. Anything not in the outcome list counts as no feedback yet.
  const closedRows = rows.filter((e) => e.issue_status === 'Closed');
  const fbCount = (label) =>
    closedRows.filter((e) => (label === 'No feedback yet' ? !FEEDBACK_OUTCOMES.includes(e.kam_feedback_status) : e.kam_feedback_status === label)).length;
  const feedbackOutcomes = {
    closed: closedRows.length,
    items: [...FEEDBACK_OUTCOMES, 'No feedback yet'].map((label) => ({ label, count: fbCount(label), pct: pct(fbCount(label), closedRows.length) })),
  };

  return {
    generatedAt: new Date(nowMs).toISOString(),
    sla,
    kpi,
    zones,
    channels: countBy(rows, (e) => e.channel),
    statuses: countBy(rows, (e) => e.ops_issue_status || 'New'),
    categories: countBy(rows, (e) => e.issue_category).slice(0, 8),
    priorities,
    weeks,
    trend,
    ageing,
    feedbackOutcomes,
    hubs: hubPerf,
    hubCount: { active: hubs.length, withIssues: hubPerf.length },
    teams,
    unmappedRaisers: unmapped,
    attention,
    attentionTotal,
    recent,
    meta: { rows: rows.length, users: users.length },
  };
}
