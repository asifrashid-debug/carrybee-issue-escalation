import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamScore, weekTrend, teamStanding, teamActions, reasonsFor } from '../lib/teamGuidance.js';

const wk = (issues, responseSlaPct, resolvedPct) => ({ week: 'x', issues, responseSlaPct, resolvedPct });
const team = (over) => ({ team: 'T', lead: 'Lead', issues: 10, open: 5, resolved: 5, resolvedPct: 50, p1Open: 0, breaches: 0, unpicked: 0, responseSlaPct: 90, weeklyDetail: [wk(5, 90, 50), wk(5, 90, 50)], ...over });

test('score averages response, resolution and breach-free shares', () => {
  // response 80, resolved 60, breach-free 100 - 20 of 10 breaches -> 0 => (80+60+0)/3 = 47
  assert.equal(teamScore(team({ responseSlaPct: 80, resolvedPct: 60, breaches: 10 })), 47);
  assert.equal(teamScore(team({ issues: 0 })), null);
});

test('score skips missing parts instead of counting them as zero', () => {
  assert.equal(teamScore(team({ responseSlaPct: null, resolvedPct: null, breaches: 0 })), 100);
});

test('weekly trend needs enough issues in both weeks', () => {
  const t = team({ weeklyDetail: [wk(2, 20, 20), wk(10, 90, 90)] });
  assert.equal(weekTrend(t), null);
  const u = team({ weeklyDetail: [wk(4, 40, 40), wk(6, 80, 80)] });
  assert.deepEqual(weekTrend(u), { from: 40, to: 80, delta: 40 });
});

test('lagging is below 60 and improving gains 10+ points', () => {
  const teams = [
    team({ team: 'Slow', lead: 'Sara', responseSlaPct: 30, resolvedPct: 20, breaches: 4, weeklyDetail: [wk(5, 40, 30), wk(5, 30, 20)] }),
    team({ team: 'Climb', lead: 'Omar', responseSlaPct: 70, resolvedPct: 60, weeklyDetail: [wk(5, 40, 40), wk(5, 80, 70)] }),
    team({ team: 'Steady', lead: 'Lina', responseSlaPct: 95, resolvedPct: 90, breaches: 0, weeklyDetail: [wk(5, 95, 90), wk(5, 95, 90)] }),
  ];
  const s = teamStanding(teams);
  assert.deepEqual(s.lagging.map((r) => r.team), ['Slow']);
  assert.deepEqual(s.improving.map((r) => r.team), ['Climb']);
  assert.ok(s.lagging[0].reasons.includes('4 SLA breaches'));
});

test('actions name the team lead and state a target', () => {
  const teams = [team({ team: '60 Feet', lead: 'Raian Islam Rudra', breaches: 2, unpicked: 1, p1Open: 2, responseSlaPct: 70, resolvedPct: 40 })];
  const { actions } = teamActions(teams, { limit: 10 });
  const titles = actions.map((a) => a.title);
  assert.ok(titles.includes('Clear 2 SLA breaches in 60 Feet'));
  assert.ok(titles.includes('Work 2 open P1 issues in 60 Feet'));
  assert.ok(titles.includes('Pick 1 unpicked issue in 60 Feet'));
  assert.ok(titles.includes('Raise on-time first comments in 60 Feet from 70% to 90%'));
  assert.ok(actions.every((a) => a.owner && a.target && a.how));
  assert.equal(actions[0].title, 'Clear 2 SLA breaches in 60 Feet'); // breaches come first
});

test('lagging teams are pointed to the strongest team', () => {
  const teams = [
    team({ team: 'Slow', lead: 'Sara', responseSlaPct: 30, resolvedPct: 20, breaches: 4 }),
    team({ team: 'Best', lead: 'Lina', responseSlaPct: 98, resolvedPct: 95, breaches: 0 }),
  ];
  const { actions } = teamActions(teams, { limit: 10 });
  const learn = actions.find((a) => a.title === 'Learn the routine from Best');
  assert.ok(learn);
  assert.equal(learn.owner, 'Sara');
});

test('teams with no issues produce no actions', () => {
  const { actions, standing } = teamActions([team({ team: 'Empty', issues: 0, responseSlaPct: null, resolvedPct: null, weeklyDetail: [] })]);
  assert.equal(actions.length, 0);
  assert.equal(standing.rows.length, 0);
});

test('reasons are capped at three and in priority order', () => {
  const r = reasonsFor(team({ breaches: 1, p1Open: 1, unpicked: 1, responseSlaPct: 10, resolvedPct: 10 }));
  assert.equal(r.length, 3);
  assert.equal(r[0], '1 SLA breach');
});

test('small samples are flagged', () => {
  const { standing } = teamActions([team({ team: 'Tiny', issues: 1, breaches: 1, responseSlaPct: 0, resolvedPct: 0 })]);
  assert.equal(standing.lagging[0].smallSample, true);
});
