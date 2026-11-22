import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opsKamPatterns, visibleOpsIssues } from '../lib/opsIssues.mjs';

// Emulates PostgREST ilike for one quoted pattern: * (sent to SQL as %) = any run, _ = one char, case-insensitive, anchored.
function ilike(value, quoted) {
  const pat = quoted.replace(/^"|"$/g, '');
  const re = pat.split('').map((c) => (c === '*' || c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${re}$`, 'is').test(String(value));
}
const dbMatches = (pats, kam) => pats === null || pats.some((p) => ilike(kam, p));

const KAM_NAMES = ['Abdul Karim', 'abdul  karim', ' ABDUL KARIM ', 'Abdul Karim (Dhaka)', "Rafi O'Neil", 'Ruma, Begum', 'A_B%C', 'Tanvir Ahmed', 'CM', 'cm', 'Cm ', 'Nadia', 'Hasan*Ali', 'Mohammad  Ali', 'Mohammad Ali', 'Shahid\tKhan'];

const users = [
  { role: 'requester', display_name: 'Abdul Karim', kam_aliases: [] },
  { role: 'mx', display_name: 'Rafi Oneil', kam_aliases: ["Rafi O'Neil"] },
  { role: 'team_lead', display_name: 'Tanvir  Ahmed', kam_aliases: ['Nadia'] },
  { role: 'cm_member', display_name: 'Someone Else', kam_aliases: [] },
  { role: 'cm_lead', display_name: 'Lead Person', kam_aliases: [] },
  { role: 'requester', display_name: 'Ruma, Begum', kam_aliases: [] },
  { role: 'requester', display_name: 'A_B%C', kam_aliases: [] },
  { role: 'requester', display_name: 'Hasan*Ali', kam_aliases: [] },
  { role: 'requester', display_name: 'Shahid Khan', kam_aliases: [] },
  { role: 'requester', display_name: 'Mohammad Ali', kam_aliases: [] },
  { role: 'management', display_name: 'Abdul Karim', kam_aliases: [] },
  { role: 'requester', display_name: '', kam_aliases: [] },
];

test('database filter never drops a row the exact visibility rule keeps', () => {
  for (const user of users) {
    const pats = opsKamPatterns(user);
    for (const kam of KAM_NAMES) {
      const rows = [{ issue_id: 'x', kam_name: kam }];
      const kept = visibleOpsIssues(user, rows).length === 1;
      if (kept) assert.ok(dbMatches(pats, kam), `${user.role} "${user.display_name}" lost "${kam}"`);
    }
  }
});

test('admin gets no database filter', () => {
  assert.equal(opsKamPatterns({ role: 'admin', display_name: 'A', kam_aliases: [] }), null);
});

test('a user with no names and no CM role sees nothing, and reads nothing', () => {
  assert.deepEqual(opsKamPatterns({ role: 'requester', display_name: '', kam_aliases: [] }), []);
  assert.deepEqual(opsKamPatterns(null), []);
});

test('CM roles also match the CM queue', () => {
  const pats = opsKamPatterns({ role: 'cm_member', display_name: 'Someone Else', kam_aliases: [] });
  assert.ok(dbMatches(pats, 'CM'));
  assert.ok(dbMatches(pats, 'cm'));
});

test('patterns use the PostgREST wildcard * and never a bare %', () => {
  for (const user of users) for (const p of opsKamPatterns(user) || []) {
    assert.ok(p.includes('*') && !p.includes('%'), p);
  }
});

test('a name with double spaces in the database still matches', () => {
  const pats = opsKamPatterns({ role: 'requester', display_name: 'Abdul Karim', kam_aliases: [] });
  assert.ok(dbMatches(pats, 'Abdul    Karim'));
  assert.ok(!dbMatches(pats, 'Abdul Rahman'));
});

test('no pattern contains a character that would break the or() filter', () => {
  for (const user of users) {
    for (const p of opsKamPatterns(user) || []) {
      assert.ok(!/[",()\\]/.test(p.slice(1, -1)), `unsafe pattern ${p}`);
    }
  }
});
