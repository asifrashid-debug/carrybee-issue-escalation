import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnalytics } from '../lib/analytics.js';
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
];

test('team members get individual figures and only their own issues count', () => {
  const escalations = [
    { ...base, issue_id: '1', email: 'a@x', issue_response_datetime: '2026-11-14T01:00:00Z', issue_pick_time: '2026-11-14T00:30:00Z' }, // on time comment
    { ...base, issue_id: '2', email: 'a@x', ops_issue_status: 'Resolved', issue_status: 'Closed', issue_response_datetime: '2026-11-14T05:00:00Z' }, // late comment, resolved
    { ...base, issue_id: '3', email: 'b@x', priority_scale: 'P1' }, // open P1, no comment, breached (raised 00:00, now 06:00)
    { ...base, issue_id: '4', email: 'c@x' }, // other team
  ];
  const r = computeAnalytics({ escalations, users, hubs: [], categories: categoriesJson, now });
  const kam = r.teams.find((t) => t.team === 'KAM');
  assert.ok(kam);
  const ann = kam.people.find((p) => p.email === 'a@x');
  const ben = kam.people.find((p) => p.email === 'b@x');
  assert.equal(ann.issues, 2);
  assert.equal(ann.resolved, 1);
  assert.equal(ann.resolvedPct, 50);
  assert.equal(ann.breaches, 0);
  assert.equal(ben.issues, 1);
  assert.equal(ben.p1Open, 1);
  assert.equal(ben.unpicked, 1);
  assert.equal(ben.breaches, 1);
  assert.equal(kam.people.find((p) => p.email === 'c@x'), undefined); // other team's member not listed
  assert.equal(kam.people[0].email, 'a@x'); // most issues first
  // A member with no issues is still listed
  assert.equal(kam.people.find((p) => p.email === 'lead@x').issues, 0);
});
