import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamPerformanceView } from '../lib/teamScope.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const categoriesJson = require('../data/categories.json');

const now = new Date('2026-11-14T06:00:00Z');
const base = { zone: 'ISD', concern_hub: 'Uttara', issue_category: 'Damage', channel: 'KAM', priority_scale: 'P3', ops_issue_status: 'New', issue_status: 'Open', submitted_at: '2026-11-14T00:00:00Z' };
const users = [
  { email: 'lead@x', display_name: 'Lead', role: 'team_lead', teams: ['KAM'] },
  { email: 'a@x', display_name: 'Ann', role: 'requester', teams: ['KAM'] },
  { email: 'b@x', display_name: 'Ben', role: 'requester', teams: ['KAM'] },
  { email: 'c@x', display_name: 'Cy', role: 'requester', teams: ['ISD'] },
  { email: 'cml@x', display_name: 'CM Lead', role: 'cm_lead', teams: ['CM'] },
  { email: 'adm@x', display_name: 'Admin', role: 'admin', teams: [] },
];
const escalations = [
  { ...base, issue_id: '1', email: 'a@x' },
  { ...base, issue_id: '2', email: 'b@x', priority_scale: 'P1' },
  { ...base, issue_id: '3', email: 'c@x' }, // other team
];

test('admin sees every team', () => {
  const r = teamPerformanceView({ session: { email: 'adm@x', role: 'admin' }, users, escalations, categories: categoriesJson, now });
  const names = r.teams.map((t) => t.team).sort();
  assert.deepEqual(names, ['CM', 'ISD', 'KAM']);
});

test('team lead sees only their own team, and only their members issues', () => {
  const r = teamPerformanceView({ session: { email: 'lead@x', role: 'team_lead', teams: ['KAM'] }, users, escalations, categories: categoriesJson, now });
  assert.deepEqual(r.teams.map((t) => t.team), ['KAM']);
  assert.equal(r.kpi.total ?? r.kpi.open, 2); // Ann and Ben only, not Cy
  assert.equal(r.teams[0].people.find((p) => p.email === 'c@x'), undefined);
  assert.equal(r.unmappedRaisers, 0);
});

test('cm lead sees only the CM team', () => {
  const r = teamPerformanceView({ session: { email: 'cml@x', role: 'cm_lead', teams: ['CM'] }, users, escalations, categories: categoriesJson, now });
  assert.deepEqual(r.teams.map((t) => t.team), ['CM']);
});

test('member sees only their own figures, not other members or teams', () => {
  const r = teamPerformanceView({ session: { email: 'a@x', role: 'requester', teams: ['KAM'] }, users, escalations, categories: categoriesJson, now });
  assert.deepEqual(r.teams.map((t) => t.team), ['KAM']);
  const people = r.teams[0].people.map((p) => p.email);
  assert.deepEqual(people, ['a@x']); // Ben is not listed
  assert.equal(r.teams[0].issues, 1); // only Ann's issue counted, not Ben's P1
  assert.equal(r.kpi.total ?? r.kpi.open, 1);
  assert.equal(r.unmappedRaisers, 0);
});

test('member in another team sees only that team', () => {
  const r = teamPerformanceView({ session: { email: 'c@x', role: 'requester', teams: ['ISD'] }, users, escalations, categories: categoriesJson, now });
  assert.deepEqual(r.teams.map((t) => t.team), ['ISD']);
  assert.equal(r.teams[0].issues, 1);
});
