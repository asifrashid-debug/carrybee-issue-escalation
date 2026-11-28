import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESCALATE_TEAMS, escalateTeam, escalatedLabel, escalateError, escalateFields, ESCALATED_VIEW } from '../lib/escalateTo.mjs';
import { IR_MAIL_SUBJECT_MAX } from '../lib/irEscalation.mjs';

test('three teams, with the route flag each one sets', () => {
  assert.deepEqual(Object.keys(ESCALATE_TEAMS), ['ir', 'central_sort', 'tnl']);
  assert.equal(ESCALATE_TEAMS.ir.route, 'route_ir');
  assert.equal(ESCALATE_TEAMS.central_sort.route, 'route_central_sort');
  assert.equal(ESCALATE_TEAMS.tnl.route, 'route_tnl');
  assert.equal(ESCALATED_VIEW, 'escalated');
});

test('escalateTeam accepts only the three keys', () => {
  assert.equal(escalateTeam('ir').label, 'IR');
  assert.equal(escalateTeam('central_sort').label, 'Central Sort');
  assert.equal(escalateTeam(' tnl ').label, 'TNL');
  assert.equal(escalateTeam('hub'), null);
  assert.equal(escalateTeam('constructor'), null);
  assert.equal(escalateTeam(undefined), null);
});

test('escalatedLabel shows the team name, and the raw value when unknown', () => {
  assert.equal(escalatedLabel('central_sort'), 'Central Sort');
  assert.equal(escalatedLabel('other'), 'other');
  assert.equal(escalatedLabel(null), '');
});

test('IR needs a Mail Subject Line; blank or spaces are refused', () => {
  assert.match(escalateError(ESCALATE_TEAMS.ir, ''), /Mail Subject Line/);
  assert.match(escalateError(ESCALATE_TEAMS.ir, '   '), /Mail Subject Line/);
  assert.equal(escalateError(ESCALATE_TEAMS.ir, 'Late delivery for merchant'), null);
});

test('IR subject is capped at the IR limit; longer text is refused, not cut', () => {
  assert.equal(escalateError(ESCALATE_TEAMS.ir, 'x'.repeat(IR_MAIL_SUBJECT_MAX)), null);
  assert.match(escalateError(ESCALATE_TEAMS.ir, 'x'.repeat(IR_MAIL_SUBJECT_MAX + 1)), /fewer/);
});

test('Central Sort and TNL need no extra fields', () => {
  assert.equal(escalateError(ESCALATE_TEAMS.central_sort, ''), null);
  assert.equal(escalateError(ESCALATE_TEAMS.tnl, undefined), null);
});

test('no team is refused', () => {
  assert.match(escalateError(null, 'x'), /Choose/);
});

test('IR fields: route flag, team, time, person and subject', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  const f = escalateFields(ESCALATE_TEAMS.ir, '  Subject  ', 'ops@example.com', now);
  assert.deepEqual(f, {
    route_ir: true,
    escalated_to: 'ir',
    escalated_at: '2026-11-14T10:00:00.000Z',
    escalated_by: 'ops@example.com',
    mail_subject: 'Subject',
  });
});

test('Central Sort fields: no mail subject is written', () => {
  const f = escalateFields(ESCALATE_TEAMS.central_sort, 'ignored', 'kam@example.com', new Date(0));
  assert.equal(f.route_central_sort, true);
  assert.equal(f.escalated_to, 'central_sort');
  assert.equal('mail_subject' in f, false);
});

test('TNL fields: route flag only for TNL', () => {
  const f = escalateFields(ESCALATE_TEAMS.tnl, '', '', new Date(0));
  assert.equal(f.route_tnl, true);
  assert.equal(f.route_ir, undefined);
  assert.equal(f.escalated_by, null);
});
