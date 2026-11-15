// Team guidance for the dashboard "What to do next" card (pure rules, no I/O).
// Input: the `teams` array from computeAnalytics (already scoped to the viewer).
// Output: who is lagging, who is improving, and specific actions with named owners.

export const GUIDANCE_TARGET = { responseSlaPct: 90, resolvedPct: 60 };
export const LAG_SCORE = 60;        // below this, a team is lagging
export const IMPROVE_POINTS = 10;   // week-over-week gain that counts as improving
export const MIN_WEEK_ISSUES = 3;   // a week needs this many issues before it is scored

const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
// plural(n, 'SLA breach', 'SLA breaches') -> '2 SLA breaches'. The plural form defaults to adding 's'.
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Overall score 0-100 = average of first-comment share, resolution share and breach-free share.
// Parts with no data are skipped. Returns null when the team has no issues.
export function teamScore(t) {
  if (!t || !t.issues) return null;
  const parts = [];
  if (t.responseSlaPct != null) parts.push(t.responseSlaPct);
  if (t.resolvedPct != null) parts.push(t.resolvedPct);
  parts.push(Math.round(100 * (1 - Math.min(t.breaches || 0, t.issues) / t.issues)));
  return parts.length ? avg(parts) : null;
}

// Score for one week (previous or current). Needs MIN_WEEK_ISSUES issues in that week.
export function weekScore(wd) {
  if (!wd || wd.issues < MIN_WEEK_ISSUES) return null;
  const parts = [wd.responseSlaPct, wd.resolvedPct].filter((x) => x != null);
  return parts.length ? avg(parts) : null;
}

// Change from the previous ISO week to the current one, in score points. Null when either week is too small.
export function weekTrend(t) {
  const [prev, cur] = t?.weeklyDetail || [];
  const a = weekScore(prev);
  const b = weekScore(cur);
  if (a == null || b == null) return null;
  return { from: a, to: b, delta: b - a };
}

// Top reasons a team is below target, most serious first.
export function reasonsFor(t) {
  const out = [];
  if (t.breaches > 0) out.push(plural(t.breaches, 'SLA breach', 'SLA breaches'));
  if (t.p1Open > 0) out.push(`${t.p1Open} open P1`);
  if (t.unpicked > 0) out.push(`${t.unpicked} unpicked`);
  if (t.responseSlaPct != null && t.responseSlaPct < GUIDANCE_TARGET.responseSlaPct) out.push(`${t.responseSlaPct}% first comments on time`);
  if (t.resolvedPct != null && t.resolvedPct < GUIDANCE_TARGET.resolvedPct) out.push(`${t.resolvedPct}% resolved`);
  return out.slice(0, 3);
}

// Who is lagging and who is improving.
export function teamStanding(teams = []) {
  const rows = teams.filter((t) => t.issues > 0).map((t) => {
    const trend = weekTrend(t);
    const score = teamScore(t);
    const delta = trend ? trend.delta : null;
    // One label per team. Lagging wins over improving; anything else is steady.
    const status = score != null && score < LAG_SCORE ? 'lagging'
      : delta != null && delta >= IMPROVE_POINTS ? 'improving'
      : 'steady';
    return {
      team: t.team, lead: t.lead || null, issues: t.issues,
      score, delta, status,
      from: trend ? trend.from : null, to: trend ? trend.to : null,
      reasons: reasonsFor(t),
      smallSample: t.issues < MIN_WEEK_ISSUES, // fewer issues than a fair comparison needs
    };
  });
  const lagging = rows.filter((r) => r.score != null && r.score < LAG_SCORE).sort((a, b) => a.score - b.score).slice(0, 2);
  const improving = rows.filter((r) => r.delta != null && r.delta >= IMPROVE_POINTS).sort((a, b) => b.delta - a.delta).slice(0, 2);
  return { rows, lagging, improving, byStatus: { lagging: rows.filter((r) => r.status === 'lagging'), improving: rows.filter((r) => r.status === 'improving'), steady: rows.filter((r) => r.status === 'steady') } };
}

// Specific actions per team, most serious first. Each has a named owner and a measurable target.
export function teamActions(teams = [], { limit = 6 } = {}) {
  const standing = teamStanding(teams);
  const byName = new Map(teams.map((t) => [t.team, t]));
  const actions = [];
  for (const t of teams) {
    if (!t.issues) continue;
    const owner = t.lead || `${t.team} lead`;
    if (t.breaches > 0) actions.push({ team: t.team, severity: 1000 + t.breaches, title: `Clear ${plural(t.breaches, 'SLA breach', 'SLA breaches')} in ${t.team}`, owner, target: 'No open issue past its 2h first-comment limit or its category resolution SLA.', how: 'Walk the breach list at the start of every shift. Give each breached issue a named owner and a comment the same day.' });
    if (t.p1Open > 0) actions.push({ team: t.team, severity: 900 + t.p1Open, title: `Work ${plural(t.p1Open, 'open P1 issue', 'open P1 issues')} in ${t.team}`, owner, target: 'Every P1 has a first comment within 2h and a named owner.', how: 'Put P1s at the top of the team queue. Check them every 2 hours until each one has a comment.' });
    if (t.unpicked > 0) actions.push({ team: t.team, severity: 800 + t.unpicked, title: `Pick ${plural(t.unpicked, 'unpicked issue', 'unpicked issues')} in ${t.team}`, owner: `${owner} with the hub incharge`, target: 'Every new issue picked within 4h.', how: 'Set a daily pick rota so one named person owns the queue at all times.' });
    if (t.responseSlaPct != null && t.responseSlaPct < GUIDANCE_TARGET.responseSlaPct) actions.push({ team: t.team, severity: 700 + (GUIDANCE_TARGET.responseSlaPct - t.responseSlaPct), title: `Raise on-time first comments in ${t.team} from ${t.responseSlaPct}% to ${GUIDANCE_TARGET.responseSlaPct}%`, owner, target: `${GUIDANCE_TARGET.responseSlaPct}% of issues get a first comment within 2h.`, how: 'Set a 2-hour reminder when an issue is picked. Use the breach list as the daily check, not a weekly review.' });
    if (t.resolvedPct != null && t.resolvedPct < GUIDANCE_TARGET.resolvedPct && t.issues - (t.resolved || 0) > 0) actions.push({ team: t.team, severity: 600 + (GUIDANCE_TARGET.resolvedPct - t.resolvedPct), title: `Lift resolution in ${t.team} from ${t.resolvedPct}% to ${GUIDANCE_TARGET.resolvedPct}%`, owner, target: `${GUIDANCE_TARGET.resolvedPct}% or more of issues resolved.`, how: 'Review the oldest open issues with the hub each week. Record a clear next step on every one.' });
  }
  // Lagging teams learn from the strongest team (score 80 or more).
  const leader = standing.rows.filter((r) => r.score != null && r.score >= 80).sort((a, b) => b.score - a.score)[0];
  for (const r of standing.lagging) {
    if (!leader || leader.team === r.team) continue;
    const t = byName.get(r.team);
    actions.push({ team: r.team, severity: 500, title: `Learn the routine from ${leader.team}`, owner: t?.lead || `${r.team} lead`, target: `${r.team} reaches a score of ${LAG_SCORE}+ within two weeks.`, how: `Ask the ${leader.team} lead${leader.lead ? ` (${leader.lead})` : ''} to share their pick and first-comment routine.` });
  }
  actions.sort((a, b) => b.severity - a.severity || a.team.localeCompare(b.team));
  return { actions: actions.slice(0, limit), standing };
}
