// Daily 8 PM (Asia/Dhaka) team report. Pure functions: no I/O here.
// Inputs match computeAnalytics (lib/analytics.js). Output: per-team sections, burning issues, and rendered email bodies.

import { computeAnalytics, dhakaDay } from './analytics.js';

const TZ = 'Asia/Dhaka';
const BURNING_AGE_HOURS = 48; // "open more than 48 hours" (matches the Ops Report's 2-day ageing bucket)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isOpen = (e) => e.issue_status !== 'Closed' && e.ops_issue_status !== 'Resolved';
const hoursSince = (iso, nowMs) => (nowMs - new Date(iso).getTime()) / 3600000;

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
export function reportDateLabel(now) { return dateFmt.format(now); }
export function reportTimeLabel(now) { return timeFmt.format(now); }

// Why an open issue needs attention. Priority: SLA breach, then P1, then age.
function burningReasons(e, attentionById, nowMs) {
  const reasons = [];
  const att = attentionById.get(e.issue_id);
  if (att) reasons.push(att.kind);
  if (e.priority_scale === 'P1') reasons.push('P1 open');
  if (hoursSince(e.submitted_at, nowMs) > BURNING_AGE_HOURS) reasons.push('Open over 48 hours');
  return [...new Set(reasons)];
}

// Build the full report from the same rows the dashboard uses.
export function buildDailyReport({ escalations, users, hubs, categories, now = new Date() }) {
  const nowMs = now.getTime();
  // OLD- rows are imported from the old sheet. They lack pick and response times, so they are
  // reported only as a backlog count, never in live metrics, breaches or the attention list.
  const isLegacy = (e) => String(e.issue_id || '').startsWith('OLD-');
  const legacyOpen = (escalations || []).filter((e) => !e.is_archived && isLegacy(e) && isOpen(e));
  const rows = (escalations || []).filter((e) => !e.is_archived && !isLegacy(e));
  const analytics = computeAnalytics({ escalations: rows, users: users || [], hubs: hubs || [], categories: categories || [], now });
  const attentionById = new Map((analytics.attention || []).map((a) => [a.issue_id, a]));
  const userByEmail = new Map((users || []).map((u) => [String(u.email).toLowerCase(), u]));
  const today = dhakaDay(now);

  const burning = rows.filter((e) => isOpen(e) && burningReasons(e, attentionById, nowMs).length)
    .map((e) => ({
      issue_id: e.issue_id,
      raiser_email: e.email,
      zone: e.zone,
      concern_hub: e.concern_hub,
      issue_category: e.issue_category,
      priority_scale: e.priority_scale || '-',
      submitted_at: e.submitted_at,
      ageHours: Math.round(hoursSince(e.submitted_at, nowMs)),
      reasons: burningReasons(e, attentionById, nowMs),
      teams: (userByEmail.get(String(e.email).toLowerCase())?.teams || []),
    }))
    .sort((a, b) => (a.priority_scale === 'P1' ? 0 : 1) - (b.priority_scale === 'P1' ? 0 : 1) || b.ageHours - a.ageHours);

  // Team sections come from computeAnalytics (same team metrics as Team Performance).
  const teamSections = (analytics.teams || []).map((t) => ({
    team: t.team,
    lead: t.lead || 'Not assigned',
    members: t.members,
    issues: t.issues,
    open: t.open,
    resolved: t.resolved,
    resolvedPct: t.resolvedPct,
    p1Open: t.p1Open,
    breaches: t.breaches,
    unpicked: t.unpicked,
    responseSlaPct: t.responseSlaPct,
    todayNew: rows.filter((e) => dhakaDay(e.submitted_at) === today && (userByEmail.get(String(e.email).toLowerCase())?.teams || []).includes(t.team)).length,
    burning: burning.filter((b) => b.teams.includes(t.team)),
  }));

  const k = analytics.kpi || {};
  return {
    generatedAt: now.toISOString(),
    dateLabel: reportDateLabel(now),
    timeLabel: reportTimeLabel(now),
    portfolio: {
      total: rows.length,
      open: k.open ?? rows.filter(isOpen).length,
      resolved: k.resolved ?? 0,
      resolvedPct: k.resolvedPct ?? null,
      p1Open: k.p1Open ?? 0,
      breaches: k.breaches ?? 0,
      unpicked: k.unpicked ?? 0,
      todayNew: rows.filter((e) => dhakaDay(e.submitted_at) === today).length,
      burningTotal: burning.length,
      legacyOpen: legacyOpen.length,
      legacyByZone: ['CTG','ISD','OSD'].map((z) => ({ zone: z, open: legacyOpen.filter((e) => e.zone === z).length })),
    },
    teams: teamSections,
    unassignedBurning: burning.filter((b) => b.teams.length === 0),
  };
}

// Recipient rules (17 Nov): team leads get their own team(s); admin and CM lead get all teams.
export function recipientPlan(users) {
  const plan = new Map();
  for (const u of users || []) {
    if (!u?.email || !u.role) continue;
    const email = String(u.email).toLowerCase();
    if (u.role === 'admin' || u.role === 'cm_lead') plan.set(email, { email, name: u.display_name || email, scope: 'all' });
    else if (u.role === 'team_lead' && (u.teams || []).length) {
      if (!plan.has(email)) plan.set(email, { email, name: u.display_name || email, scope: 'teams', teams: u.teams });
    }
  }
  return [...plan.values()];
}

// One email per recipient. Team leads see only their teams; admin and CM lead see everything.
export function buildMessages(report, users, { appUrl = '' } = {}) {
  return recipientPlan(users).map((r) => {
    const sections = r.scope === 'all'
      ? report.teams
      : report.teams.filter((t) => (r.teams || []).includes(t.team));
    const burningShown = r.scope === 'all'
      ? report.teams.flatMap((t) => t.burning.map((b) => ({ ...b, team: t.team })))
      : sections.flatMap((t) => t.burning.map((b) => ({ ...b, team: t.team })));
    const subject = r.scope === 'all'
      ? `Daily Issue Escalation Report, all teams | ${report.dateLabel}`
      : `Daily Issue Escalation Report, ${(r.teams || []).join(', ')} | ${report.dateLabel}`;
    return {
      to: r.email,
      name: r.name,
      subject,
      html: renderHtml({ report, name: r.name, sections, burning: burningShown, scope: r.scope, appUrl }),
      text: renderText({ report, name: r.name, sections, burning: burningShown, scope: r.scope }),
    };
  });
}

const pct = (v) => (v == null ? '-' : `${v}%`);
const BURN_LIMIT = 15;

function renderText({ report, name, sections, burning, scope }) {
  const lines = [];
  lines.push('Dear Concern,', '');
  lines.push(`Please find the daily performance summary for ${scope === 'all' ? 'all teams' : 'your team(s)'} as of ${report.dateLabel}, ${report.timeLabel} (Dhaka time).`, '');
  for (const s of sections) {
    lines.push(`${s.team} (lead: ${s.lead})`);
    lines.push(`  Members ${s.members} | Issues ${s.issues} | Open ${s.open} | Resolved ${s.resolved} (${pct(s.resolvedPct)}) | P1 open ${s.p1Open} | SLA breaches ${s.breaches} | Unpicked ${s.unpicked} | New today ${s.todayNew}`);
  }
  lines.push('', `Issues requiring attention (${burning.length}):`);
  for (const b of burning.slice(0, BURN_LIMIT)) {
    lines.push(`  ${b.issue_id} | ${b.team || b.zone} | ${b.concern_hub} | ${b.priority_scale} | ${b.ageHours}h | ${b.reasons.join('; ')}`);
  }
  if (burning.length > BURN_LIMIT) lines.push(`  ...and ${burning.length - BURN_LIMIT} more in the tracker.`);
  if (report.portfolio.legacyOpen) lines.push('', `Imported backlog (OLD- rows, not in the figures above): ${report.portfolio.legacyOpen} open (${report.portfolio.legacyByZone.map((z) => z.zone + ' ' + z.open).join(', ')}).`);
  lines.push('', 'Please review the open items with your hub and cluster leads and update the tracker where action is needed.', '', 'Regards,', '', 'Ahmed Asif Rashid', 'Assistant Manager, Business Development', 'CarryBee Express Limited');
  return lines.join('\n');
}

function renderHtml({ report, name, sections, burning, scope, appUrl }) {
  const p = report.portfolio;
  const th = 'style="text-align:left;padding:6px 10px;border-bottom:1px solid #d9dee7;font-size:12px;color:#5b6676;"';
  const td = 'style="padding:6px 10px;border-bottom:1px solid #eef1f5;font-size:13px;color:#1f2933;"';
  const kpi = (label, value) => `<td style="padding:10px 12px;background:#f5f7fa;border-radius:6px;text-align:center;"><div style="font-size:20px;font-weight:600;color:#1f2933;">${esc(value)}</div><div style="font-size:11px;color:#5b6676;">${esc(label)}</div></td>`;
  const teamRows = sections.map((s) => `<tr>
      <td ${td}><strong>${esc(s.team)}</strong><br><span style="color:#5b6676;font-size:12px;">Lead: ${esc(s.lead)}</span></td>
      <td ${td}>${esc(s.members)}</td><td ${td}>${esc(s.issues)}</td><td ${td}>${esc(s.open)}</td>
      <td ${td}>${esc(s.resolved)} (${esc(pct(s.resolvedPct))})</td><td ${td}>${esc(s.p1Open)}</td>
      <td ${td}>${esc(s.breaches)}</td><td ${td}>${esc(s.unpicked)}</td><td ${td}>${esc(s.todayNew)}</td></tr>`).join('');
  const burnRows = burning.slice(0, BURN_LIMIT).map((b) => `<tr>
      <td ${td}>${esc(b.issue_id)}</td><td ${td}>${esc(b.team || b.zone)}</td><td ${td}>${esc(b.concern_hub)}</td>
      <td ${td}>${esc(b.priority_scale)}</td><td ${td}>${esc(b.ageHours)}h</td><td ${td}>${esc(b.reasons.join('; '))}</td></tr>`).join('');
  const legacyLine = p.legacyOpen ? `<p style="font-size:13px;color:#5b6676;">Imported backlog (OLD- rows, not included in the figures above): <strong>${esc(p.legacyOpen)}</strong> open (${esc(p.legacyByZone.map((z) => z.zone + ' ' + z.open).join(', '))}).</p>` : '';
  const more = burning.length > BURN_LIMIT ? `<p style="font-size:13px;color:#5b6676;">...and ${burning.length - BURN_LIMIT} more. Open the tracker to see the full list.</p>` : '';
  const link = appUrl ? `<p style="font-size:13px;"><a href="${esc(appUrl)}" style="color:#0b5cad;">Open the Issue Escalation Tracker</a></p>` : '';
  const intro = scope === 'all'
    ? 'Please find below the daily performance summary for all teams.'
    : 'Please find below the daily performance summary for your team(s).';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<div style="max-width:760px;margin:0 auto;padding:24px;">
  <p style="font-size:15px;margin:0 0 4px;">Dear Concern,</p>
  <p style="font-size:14px;line-height:1.5;margin:0 0 16px;">${esc(intro)} Figures are as of ${esc(report.dateLabel)}, ${esc(report.timeLabel)} (Dhaka time).</p>
  <table role="presentation" cellspacing="6" width="100%" style="margin-bottom:18px;"><tr>
    ${kpi('Total issues', p.total)}${kpi('Open', p.open)}${kpi('Resolved', `${p.resolved} (${pct(p.resolvedPct)})`)}${kpi('P1 open', p.p1Open)}${kpi('Needs attention', p.burningTotal)}${kpi('New today', p.todayNew)}
  </tr></table>
  <h3 style="font-size:15px;margin:18px 0 8px;">Team performance</h3>
  <table role="presentation" cellspacing="0" width="100%" style="border-collapse:collapse;">
    <tr><th ${th}>Team</th><th ${th}>Members</th><th ${th}>Issues</th><th ${th}>Open</th><th ${th}>Resolved</th><th ${th}>P1 open</th><th ${th}>SLA breaches</th><th ${th}>Unpicked</th><th ${th}>New today</th></tr>
    ${teamRows || `<tr><td ${td} colspan="9">No team data available.</td></tr>`}
  </table>
  <h3 style="font-size:15px;margin:22px 0 8px;">Issues requiring attention (${burning.length})</h3>
  ${burning.length ? `<table role="presentation" cellspacing="0" width="100%" style="border-collapse:collapse;">
    <tr><th ${th}>Issue ID</th><th ${th}>Team</th><th ${th}>Hub</th><th ${th}>Priority</th><th ${th}>Age</th><th ${th}>Reason</th></tr>
    ${burnRows}</table>${more}` : '<p style="font-size:13px;color:#5b6676;">No issues need attention today.</p>'}
  ${legacyLine}
  <p style="font-size:14px;line-height:1.5;margin:22px 0 8px;">We would be grateful if you could review the open items with your hub and cluster leads and update the tracker where action is still needed.</p>
  ${link}
  <p style="font-size:14px;margin:18px 0 0;">Regards,<br><br><strong>Ahmed Asif Rashid</strong><br>Assistant Manager, Business Development<br>CarryBee Express Limited</p>
</div></body></html>`;
}
