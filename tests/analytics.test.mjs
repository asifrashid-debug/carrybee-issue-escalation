import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnalytics, median, dhakaDay } from '../lib/analytics.js';
import { sampleData } from '../lib/sample.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const hubsJson = require('../data/hubs.json');
const categoriesJson = require('../data/categories.json');

const now = new Date('2026-11-14T06:00:00Z');
const base = { submitted_at: '2026-11-14T00:00:00Z', email: 'a@x', zone: 'ISD', concern_hub: 'Uttara', issue_status: 'Open', priority_scale: 'P3', ops_issue_status: 'New', channel: 'KAM' };

test('median handles odd, even and empty', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('dhakaDay uses Asia/Dhaka calendar date', () => {
  assert.equal(dhakaDay('2026-11-13T19:00:00Z'), '2026-11-14');
});

test('KPIs and SLA counts', () => {
  const rows = [
    { ...base, issue_pick_time: '2026-11-14T02:00:00Z', issue_response_datetime: '2026-11-14T03:00:00Z' }, // pick 2h, resp 3h
    { ...base, issue_pick_time: '2026-11-14T10:00:00Z', issue_status: 'Closed', ops_issue_status: 'Resolved' }, // pick 10h (breach)
    { ...base, email: 'b@x', zone: 'CTG', concern_hub: 'Agrabad', priority_scale: 'P1' }, // unpicked, >4h -> breach
    { ...base, is_archived: true }, // excluded
  ];
  const r = computeAnalytics({ escalations: rows, now });
  assert.equal(r.kpi.total, 3);
  assert.equal(r.kpi.open, 2);
  assert.equal(r.kpi.unpicked, 1);
  assert.equal(r.kpi.resolved, 1);
  assert.equal(r.kpi.p1Open, 1);
  assert.equal(r.kpi.pickSlaPct, 50); // 2h ok, 10h not
  assert.equal(r.kpi.responseSlaPct, 0); // first comment 3h after raise, spec SLA is 2h
  assert.equal(r.kpi.breaches, 1); // open, no comment, raised more than 2h ago (the unpicked P1)
  assert.equal(r.zones.find((z) => z.zone === 'CTG').total, 1);
});

test('hub and team performance', () => {
  const users = [
    { email: 'a@x', display_name: 'Lead', role: 'team_lead', teams: ['KAM'] },
    { email: 'a2@x', display_name: 'Mem', role: 'requester', teams: ['KAM'] },
  ];
  const hubs = [{ hub_name: 'Uttara', zone: 'ISD', division: 'Dhaka', regional_lead: 'RL' }];
  const rows = [{ ...base, issue_response_datetime: '2026-11-14T01:00:00Z' }, { ...base, email: 'zz@x', concern_hub: 'Uttara' }];
  const r = computeAnalytics({ escalations: rows, users, hubs, now });
  const h = r.hubs[0];
  assert.equal(h.hub, 'Uttara');
  assert.equal(h.total, 2);
  assert.equal(h.regionalLead, 'RL');
  const kam = r.teams.find((t) => t.team === 'KAM');
  assert.equal(kam.lead, 'Lead');
  assert.equal(kam.issues, 1);
  assert.equal(kam.members, 2);
  assert.equal(r.unmappedRaisers, 1);
});

test('trend has the requested number of days and empty input is safe', () => {
  const r = computeAnalytics({ escalations: [], now, days: 14 });
  assert.equal(r.trend.length, 14);
  assert.equal(r.kpi.total, 0);
  assert.equal(r.kpi.pickSlaPct, null);
});

test('sample dataset produces a rich, consistent analytics payload', () => {
  const s = sampleData({ hubsJson, categoriesJson, now });
  const r = computeAnalytics(s);
  assert.equal(r.kpi.total, 420);
  assert.ok(r.hubs.length > 5);
  assert.ok(r.teams.length >= 8);
  assert.ok(r.kpi.pickSlaPct > 0 && r.kpi.pickSlaPct <= 100);
});

test('attention list holds open comment-SLA breaches, P1 first, and caps at 8', () => {
  const now = new Date('2026-11-14T08:00:00Z');
  const mk = (id, hoursAgo, extra = {}) => ({ issue_id: id, submitted_at: new Date(now.getTime() - hoursAgo * 3600e3).toISOString(), issue_status: 'Open', priority_scale: 'P3', zone: 'OSD', concern_hub: 'H', issue_category: 'C', channel: 'KAM', ...extra });
  const picked = '2026-11-13T10:00:00Z';
  const escalations = [
    mk('A', 10, { issue_pick_time: picked, issue_response_datetime: picked }), // commented: not a breach
    mk('B', 30, { priority_scale: 'P1' }),                         // 30h, never picked: pick breach
    mk('C', 30, { priority_scale: 'P2', issue_pick_time: picked }), // picked, no response after 30h: response breach
    mk('D', 2, { priority_scale: 'P1' }),                          // 2h, not yet breached
  ];
  const out = computeAnalytics({ escalations, users: [], hubs: [], now });
  assert.equal(out.attentionTotal, 2);
  assert.deepEqual(out.attention.map((a) => a.issue_id), ['B', 'C']);
  assert.equal(out.attention[0].kind, 'No comment');
  assert.equal(out.attention[1].kind, 'No comment');
  assert.equal(out.attention[1].nextAction, 'CM followup due');
  assert.ok(out.attention[0].overdueH > 0);
  const many = Array.from({ length: 12 }, (_, i) => mk('X' + i, 40 + i));
  const big = computeAnalytics({ escalations: many, users: [], hubs: [], now });
  assert.equal(big.attention.length, 8);
  assert.equal(big.attentionTotal, 12);
});

test('priority mix, zone SLA and weekly team counts', async () => {
  const { isoWeekKey } = await import('../lib/analytics.js');
  assert.equal(isoWeekKey('2026-11-14T06:00:00Z'), '2026 W46');
  assert.equal(isoWeekKey('2026-11-02T06:00:00Z'), '2026 W45');
  const r = computeAnalytics({
    escalations: [
      { ...base, issue_id: 'A', priority_scale: 'P1', submitted_at: '2026-11-14T00:00:00Z', issue_response_datetime: '2026-11-14T01:00:00Z' },
      { ...base, issue_id: 'B', priority_scale: 'P2', submitted_at: '2026-11-07T00:00:00Z' },
    ],
    users: [{ email: 'a@x', role: 'requester', teams: ['ISD Business'] }],
    hubs: [],
    now,
  });
  assert.deepEqual(r.priorities.map((p) => p.total), [1, 1, 0, 0]);
  assert.equal(r.zones.find((z) => z.zone === 'ISD').responseSlaPct, 50); // A commented in time; B is an open breach
  assert.equal(r.zones.find((z) => z.zone === 'ISD').breaches, 1);
  assert.deepEqual(r.weeks, ['2026 W45', '2026 W46']);
  assert.deepEqual(r.teams[0].weekly, [1, 1]);
  assert.equal(r.kpi.picked, 0);
  assert.equal(r.kpi.responded, 1);
});
