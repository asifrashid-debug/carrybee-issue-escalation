// Checks the tracker's issue visibility against the confirmed rules (SOP section 9).
// Run with LIB=../orig/lib to test the old code, or leave LIB unset to test the fixed code.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const LIB = process.env.LIB || '../lib';
const { loadScope, isVisible, scopeFilter } = await import(`${LIB}/visibility.js`);

const person = (email, role, teams, display_name, kam_aliases = []) => ({ email, role, teams, display_name, kam_aliases, is_active: true });
const USERS = [
  person('akash@x', 'team_lead', ['KAM'], 'Akash Saha'),
  person('anik@x', 'requester', ['KAM'], 'Anik Ahamed'),
  person('jaber@x', 'requester', ['KAM'], 'Jaber Al Aunto', ['Jaber Aunto']),
  person('shuvo@x', 'team_lead', ['OSD'], 'Shohanur Rahman Shuvo'),
  person('shihab@x', 'requester', ['OSD'], 'S. M Shihab'),
  person('rasel@x', 'requester', ['OSD'], 'Md. Rasel'),
  person('asif@x', 'cm_lead', ['CM'], 'Ahmed Asif Rashid'),
  person('tanzim@x', 'cm_member', ['CM'], 'Tanzim Iniat Islam'),
  person('nahid@x', 'cm_member', ['CM'], 'Nuruzzaman Nahid'),
  person('mafi@x', 'mx', ['IB'], 'Md Mojahidul Islam Mafi'),
  person('admin@x', 'admin', [], 'Admin'),
];

// Issues. A = KAM-channel issue, MX = MX channel. kam_name is the assigned KAM name.
const ISSUES = [
  { issue_id: 'A', email: 'anik@x', channel: 'KAM', kam_name: 'Other' },
  { issue_id: 'B', email: 'mafi@x', channel: 'MX', kam_name: 'Anik Ahamed' },
  { issue_id: 'C', email: 'shihab@x', channel: 'KAM', kam_name: 'Anik Ahamed' },
  { issue_id: 'D', email: 'shihab@x', channel: 'MX', kam_name: 'Jaber Aunto' },
  { issue_id: 'E', email: 'shihab@x', channel: 'KAM', kam_name: 'CM', cm_assigned: true, business_pick_time: null },
  { issue_id: 'F', email: 'tanzim@x', channel: 'KAM', kam_name: 'Other' },
  { issue_id: 'G', email: 'rasel@x', channel: 'KAM', kam_name: 'Someone' },
  { issue_id: 'H', email: 'rasel@x', channel: 'MX', kam_name: 'S. M Shihab' },
  { issue_id: 'I', email: 'shihab@x', channel: 'MX', kam_name: 'CM', cm_assigned: true, business_pick_time: null },
  { issue_id: 'J', email: 'shihab@x', channel: 'KAM', kam_name: 'CM', cm_assigned: true, business_pick_time: '2026-11-18T05:00:00Z' },
  { issue_id: 'K', email: 'jaber@x', channel: 'KAM', kam_name: 'Jaber Aunto' },
  { issue_id: 'L', email: 'anik@x', channel: 'MX', kam_name: 'Akash Saha' },
];

function fakeSb() {
  const chain = (rows) => {
    const c = {
      select() { return c; },
      eq() { return c; },
      in() { return c; },
      then(resolve) { resolve({ data: rows }); },
    };
    return c;
  };
  return {
    from(table) {
      return chain(table === 'users_roles' ? USERS : []);
    },
  };
}

// Expected visible issue IDs per user, from the rules.
const EXPECTED = {
  'akash@x': ['A', 'B', 'C', 'D', 'K', 'L'],      // KAM team lead: team raised (A, K, L) + team names (B, C, D)
  'anik@x': ['A', 'B', 'L'],                        // KAM member: own (A, L) + MX named Anik Ahamed (B)
  'jaber@x': ['D', 'K'],                            // KAM member: own (K) + MX named Jaber Aunto (D)
  'shuvo@x': ['C', 'D', 'E', 'G', 'H', 'I', 'J'],   // OSD team lead: team raised (C, D, E, G, H, I, J)
  'shihab@x': ['C', 'D', 'E', 'H', 'I', 'J'],       // OSD member: own (C, D, E, I, J) + MX named S. M Shihab (H)
  'rasel@x': ['G', 'H'],                            // OSD member: own only
  'asif@x': ['B', 'D', 'F', 'H', 'I', 'L'],         // CM lead: MX channel (B, D, H, I, L) + CM member raised (F)
  'tanzim@x': ['B', 'D', 'E', 'F', 'H', 'I', 'J', 'L'], // CM member: own (F) + MX channel (B, D, H, I, L) + KAM name CM (E, I, J)
  'nahid@x': ['B', 'D', 'E', 'H', 'I', 'J', 'L'],   // CM member: MX channel + KAM name CM
  'mafi@x': ['B'],                                  // MX (IB) member: own only
  'admin@x': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
};

for (const user of USERS) {
  test(`visibility: ${user.display_name} (${user.role}) sees the expected issues`, async () => {
    const sb = fakeSb();
    const { email, role, teams, display_name } = user;
    const scope = await loadScope(sb, { email, role, teams, display_name });
    const visible = ISSUES.filter((i) => isVisible(scope, i)).map((i) => i.issue_id).sort();
    assert.deepEqual(visible, [...EXPECTED[email]].sort());
  });
}

test('list filter: team lead filter includes team member names (any channel)', async () => {
  const scope = await loadScope(fakeSb(), { email: 'akash@x', role: 'team_lead', teams: ['KAM'], display_name: 'Akash Saha' });
  const f = scopeFilter(scope);
  assert.ok(f.includes('kam_name.ilike."anik ahamed"'), f);
  assert.ok(f.includes('kam_name.ilike."jaber aunto"'), f);
  assert.ok(!f.includes('channel.eq.MX'), 'team lead filter must not be MX-only');
});

test('list filter: CM member filter includes MX channel and KAM name CM, and no pool or pick rule', async () => {
  const scope = await loadScope(fakeSb(), { email: 'tanzim@x', role: 'cm_member', teams: ['CM'], display_name: 'Tanzim Iniat Islam' });
  const f = scopeFilter(scope);
  assert.ok(f.includes('channel.eq.MX'), f);
  assert.ok(f.includes('kam_name.ilike."CM"'), f);
  assert.ok(!f.includes('business_pick_time'), f);
  assert.ok(!f.includes('issue_id.in.'), f);
});

test('list filter: named-KAM MX rule for requesters', async () => {
  const scope = await loadScope(fakeSb(), { email: 'jaber@x', role: 'requester', teams: ['KAM'], display_name: 'Jaber Al Aunto' });
  const f = scopeFilter(scope);
  assert.ok(f.includes('and(channel.eq.MX,or(kam_name.ilike."jaber al aunto",kam_name.ilike."jaber aunto"))'), f);
});

test('admin sees everything', async () => {
  const scope = await loadScope(fakeSb(), { email: 'admin@x', role: 'admin', teams: [] });
  assert.equal(scope.all, true);
});
