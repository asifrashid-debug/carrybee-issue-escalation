import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canView, emailScope } from '../lib/roles.js';
import { scopeFilter, isVisible } from '../lib/visibility.js';

const users = [
  { email: 'req1@carrybee.com', role: 'requester', teams: ['KAM'] },
  { email: 'req2@carrybee.com', role: 'requester', teams: ['KAM'] },
  { email: 'other@carrybee.com', role: 'requester', teams: ['OSD'] },
  { email: 'mx1@carrybee.com', role: 'mx', teams: ['IB'] },
  { email: 'cm1@carrybee.com', role: 'cm_member', teams: ['CM'] },
  { email: 'cm2@carrybee.com', role: 'cm_member', teams: ['CM'] },
  { email: 'lead@carrybee.com', role: 'cm_lead', teams: ['CM'] },
  { email: 'tl@carrybee.com', role: 'team_lead', teams: ['KAM'] },
];
const by = (e) => users.find((u) => u.email === e);
const user = (e) => by(e);

test('a member sees only the issues they raised', () => {
  const mine = { email: 'req1@carrybee.com' };
  const teammate = { email: 'req2@carrybee.com' };
  assert.equal(canView(user('req1@carrybee.com'), mine, by('req1@carrybee.com')), true);
  assert.equal(canView(user('req1@carrybee.com'), teammate, by('req2@carrybee.com')), false);
  assert.equal(canView(user('mx1@carrybee.com'), { email: 'req1@carrybee.com' }, by('req1@carrybee.com')), false);
});

test('a team lead sees their full team, not other teams', () => {
  const tl = user('tl@carrybee.com');
  assert.equal(canView(tl, { email: 'req1@carrybee.com' }, by('req1@carrybee.com')), true);
  assert.equal(canView(tl, { email: 'req2@carrybee.com' }, by('req2@carrybee.com')), true);
  assert.equal(canView(tl, { email: 'other@carrybee.com' }, by('other@carrybee.com')), false);
});

test('a CM member sees all MX-channel issues and issues named CM, not other KAM issues', () => {
  const cm = user('cm1@carrybee.com');
  const mxIssue = { email: 'mx1@carrybee.com', channel: 'MX', kam_name: 'Rakib', cm_assigned: false };
  const cmNamed = { email: 'req1@carrybee.com', channel: 'KAM', kam_name: 'CM', cm_assigned: false };
  assert.equal(canView(cm, mxIssue, by('mx1@carrybee.com')), true);
  assert.equal(canView(cm, cmNamed, by('req1@carrybee.com')), true);
  assert.equal(canView(cm, { email: 'req1@carrybee.com', channel: 'KAM', kam_name: 'Someone', cm_assigned: false }, by('req1@carrybee.com')), false);
});

test('a CM lead sees the CM team and MX issues, as before', () => {
  const lead = user('lead@carrybee.com');
  assert.equal(canView(lead, { email: 'mx1@carrybee.com', channel: 'MX' }, by('mx1@carrybee.com')), true);
  assert.equal(canView(lead, { email: 'cm2@carrybee.com' }, by('cm2@carrybee.com')), true);
  assert.equal(canView(lead, { email: 'req1@carrybee.com' }, by('req1@carrybee.com')), false);
});

test('management, regional leads and hub ops see no issues', () => {
  for (const role of ['management', 'regional_lead', 'hub_ops']) {
    const u = { email: `${role}@carrybee.com`, role, teams: [] };
    assert.equal(canView(u, { email: 'req1@carrybee.com' }, by('req1@carrybee.com')), false);
    assert.deepEqual(emailScope(u, users), []);
  }
});

test('admin sees everything through isVisible', () => {
  assert.equal(isVisible({ all: true }, { email: 'x@carrybee.com' }), true);
});

test('list filter matches the rules: member and CM member', () => {
  assert.equal(scopeFilter({ emails: ['req1@carrybee.com'], pickedIds: [], kamNameList: [] }), 'email.in.("req1@carrybee.com")');
  const cmFilter = scopeFilter({ emails: ['cm1@carrybee.com'], pickedIds: [], kamNameList: [], user: { role: 'cm_member' } });
  assert.match(cmFilter, /email\.in\.\("cm1@carrybee\.com"\)/);
  assert.match(cmFilter, /channel\.eq\.MX/);
  assert.match(cmFilter, /kam_name\.ilike\."CM"/);
  assert.equal(scopeFilter({ emails: [], pickedIds: [], kamNameList: [] }), 'issue_id.eq.__none__');
});

test('emailScope for a team lead includes the team and the lead', () => {
  const scope = emailScope(user('tl@carrybee.com'), users);
  assert.ok(scope.includes('tl@carrybee.com'));
  assert.ok(scope.includes('req1@carrybee.com'));
  assert.ok(scope.includes('req2@carrybee.com'));
  assert.ok(!scope.includes('other@carrybee.com'));
});

