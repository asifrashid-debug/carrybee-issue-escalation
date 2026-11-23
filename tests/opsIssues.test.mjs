import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPS_HEADERS, OPS_FIELDS, COL, L, OPS_LAST_COL, KAM_FEEDBACK_MAX, colLetter,
  buildKamIndex, lookupKam, parseOpsRow, planOpsRow, toDbRecord,
  visibleOpsIssues, canEditKamFeedback, cleanKamFeedback, withHubZone,
} from '../lib/opsIssues.mjs';

const master = [
  { business_name: 'Daraz Fashion', kam_name: 'Rahim Uddin', is_active: true },
  { business_name: '  pathao  ', kam_name: 'Sadia Noor', is_active: true },
  { business_name: 'Shohoz', kam_name: 'Karim', is_active: false },           // inactive: ignored
  { business_name: 'NoKam Ltd', kam_name: '  ', is_active: true },           // no KAM: ignored
  { business_name: 'Shared Shop', kam_name: 'Rahim Uddin', is_active: true },
  { business_name: 'Shared Shop', kam_name: 'Sadia Noor', is_active: true }, // two KAMs: ambiguous
  { business_name: 'Same Shop', kam_name: 'Rahim  Uddin', is_active: true },
  { business_name: 'Same Shop', kam_name: 'rahim uddin', is_active: true },  // same KAM after normalising: not ambiguous
];
const index = buildKamIndex(master);

test('sheet layout: 12 headers A to L; Issue Raise Time sits in B; HUB Name sits right after HUB Feedback', () => {
  assert.equal(OPS_HEADERS.length, 12);
  assert.equal(OPS_HEADERS[0], 'Issue ID');
  assert.equal(OPS_HEADERS[1], 'Issue Raise Time');
  assert.equal(OPS_HEADERS[2], 'Consignment ID');
  assert.equal(OPS_HEADERS[3], 'Merchant Name');
  assert.equal(OPS_HEADERS[6], 'HUB Feedback');
  assert.equal(OPS_HEADERS[7], 'HUB Name');
  assert.equal(OPS_HEADERS[8], 'KAM Name');
  assert.equal(OPS_HEADERS[9], 'Issue Status');
  assert.equal(OPS_HEADERS[10], 'Validation');
  assert.equal(OPS_HEADERS[11], 'KAM Feedback');
  assert.equal(OPS_FIELDS.length, 12);
  assert.equal(COL.raise_time, 1);
  assert.equal(COL.hub_name, 7);
  assert.equal(COL.kam_feedback, 11);
  assert.equal(colLetter(0), 'A');
  assert.equal(OPS_LAST_COL, 'L');
});

test('field letters follow the headers: B raise time, H HUB Name, I KAM Name, J Status, K Validation, L KAM Feedback', () => {
  assert.equal(L.raise_time, 'B');
  assert.equal(L.hub_name, 'H');
  assert.equal(L.kam_name, 'I');
  assert.equal(L.issue_status, 'J');
  assert.equal(L.validation, 'K');
  assert.equal(L.kam_feedback, 'L');
});

test('raise time is never content: a row with only a raise time is skipped, and it is parsed but not written back', () => {
  const blank = Array(12).fill('');
  blank[1] = '23-Nov-2026 10:48 AM';
  assert.equal(planOpsRow(parseOpsRow(blank), index).skip, true);
  assert.equal(parseOpsRow(blank).raise_time, '23-Nov-2026 10:48 AM');
});

test('the sheet read covers the new columns and the sync write-back letters are unchanged in meaning', () => {
  // Read A1:L, so a row's cells line up with OPS_FIELDS by index.
  const row = Array(12).fill('');
  row[0] = 'CB-1'; row[2] = 'C1'; row[3] = 'Daraz Fashion'; row[7] = 'Hub A'; row[9] = 'Raised'; row[10] = 'Valid'; row[11] = 'ok';
  const o = parseOpsRow(row);
  assert.equal(o.issue_id, 'CB-1');
  assert.equal(o.consignment_id, 'C1');
  assert.equal(o.merchant_name, 'Daraz Fashion');
  assert.equal(o.hub_name, 'Hub A');
  assert.equal(o.issue_status, 'Raised');
  assert.equal(o.validation, 'Valid');
  assert.equal(o.kam_feedback, 'ok');
});

test('buildKamIndex skips inactive rows and rows with no KAM', () => {
  assert.equal(index.has('shohoz'), false);
  assert.equal(index.has('nokam ltd'), false);
});

test('buildKamIndex normalises the merchant name (case and spaces)', () => {
  assert.equal(index.get('pathao'), 'Sadia Noor');
  assert.equal(index.get('daraz fashion'), 'Rahim Uddin');
});

test('buildKamIndex marks a merchant with two different KAMs as ambiguous', () => {
  assert.equal(index.get('shared shop'), null);
});

test('buildKamIndex keeps a merchant whose KAM names differ only by case or spacing', () => {
  assert.equal(index.get('same shop'), 'Rahim Uddin');
});

test('lookupKam returns matched, ambiguous, not_found or no_merchant', () => {
  assert.deepEqual(lookupKam(index, ' DARAZ   fashion '), { kam: 'Rahim Uddin', status: 'matched' });
  assert.deepEqual(lookupKam(index, 'Shared Shop'), { kam: '', status: 'ambiguous' });
  assert.deepEqual(lookupKam(index, 'Unknown Co'), { kam: '', status: 'not_found' });
  assert.deepEqual(lookupKam(index, '   '), { kam: '', status: 'no_merchant' });
  assert.deepEqual(lookupKam(index, undefined), { kam: '', status: 'no_merchant' });
});

// Builds one 12-cell sheet row (A to L) from field names, so the fixtures do not depend on column positions.
const sheetRow = (cells) => {
  const r = Array(OPS_FIELDS.length).fill('');
  for (const [field, value] of Object.entries(cells)) r[COL[field]] = value;
  return r;
};

test('parseOpsRow reads cells by column and treats missing cells as blank', () => {
  const o = parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: '  Daraz  Fashion ', issue_category: 'Cat', hub_feedback: 'hub note', hub_name: ' Comilla-Sadar ' }));
  assert.equal(o.issue_id, 'CB-1');
  assert.equal(o.consignment_id, '');
  assert.equal(o.merchant_name, 'Daraz Fashion');
  assert.equal(o.hub_feedback, 'hub note');
  assert.equal(o.hub_name, 'Comilla-Sadar');
  assert.equal(o.kam_feedback, '');
  // A short row (cells missing at the end) is also blank for those cells.
  assert.equal(parseOpsRow(['CB-2', '', '', 'Pathao']).kam_feedback, '');
});

test('planOpsRow skips a row with nothing in it (Issue ID alone does not count)', () => {
  assert.equal(planOpsRow(parseOpsRow([]), index).skip, true);
  assert.equal(planOpsRow(parseOpsRow(['CB-9']), index).skip, true);
});

test('planOpsRow asks for an Issue ID when the A cell is blank', () => {
  const p = planOpsRow(parseOpsRow(sheetRow({ merchant_name: 'Pathao' })), index);
  assert.equal(p.skip, false);
  assert.equal(p.actions.needsId, true);
  assert.equal(p.actions.kam_name, 'Sadia Noor');
});

test('planOpsRow fills KAM Name on a Merchant Name match only when it differs', () => {
  assert.equal(planOpsRow(parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: 'Pathao' })), index).actions.kam_name, 'Sadia Noor');
  assert.equal(planOpsRow(parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: 'Pathao', kam_name: 'sadia noor' })), index).actions.kam_name, undefined);
});

test('planOpsRow never fills KAM Name when the merchant is unknown or ambiguous', () => {
  const unknown = planOpsRow(parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: 'Unknown Co' })), index);
  assert.equal(unknown.kamStatus, 'not_found');
  assert.equal(unknown.actions.kam_name, undefined);
  const amb = planOpsRow(parseOpsRow(sheetRow({ issue_id: 'CB-2', merchant_name: 'Shared Shop', kam_name: 'Typed Name' })), index);
  assert.equal(amb.kamStatus, 'ambiguous');
  assert.equal(amb.actions.kam_name, undefined);
});

test('toDbRecord: a filled sheet KAM Feedback wins, a blank one keeps the DB value', () => {
  const sheetWins = toDbRecord(parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: 'X', kam_feedback: 'from sheet' })),
    { issueId: 'CB-1', kamName: 'K', dbFeedback: 'old', sid: 's', rowNumber: 5 });
  assert.equal(sheetWins.kam_feedback, 'from sheet');
  assert.equal(sheetWins.hub_name, null);
  const withHub = toDbRecord(parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: 'X', hub_name: 'Dhaka Hub' })),
    { issueId: 'CB-1', kamName: 'K', dbFeedback: null, sid: 's', rowNumber: 5 });
  assert.equal(withHub.hub_name, 'Dhaka Hub');
  const keeps = toDbRecord(parseOpsRow(sheetRow({ issue_id: 'CB-1', merchant_name: 'X' })),
    { issueId: 'CB-1', kamName: 'K', dbFeedback: 'old', sid: 's', rowNumber: 5 });
  assert.equal(keeps.kam_feedback, 'old');
  assert.equal(keeps.consignment_id, null);
  assert.equal(keeps.sheet_row_number, 5);
});

// KAM users. display_name plus kam_aliases (users_roles), as lib/roles.js uses them.
const kamA = { email: 'a@carrybee.com', role: 'requester', display_name: 'Rahim Uddin', kam_aliases: ['Rahim U.'] };
const kamB = { email: 'b@carrybee.com', role: 'team_lead', display_name: 'Sadia Noor', kam_aliases: [] };
const mxC = { email: 'c@carrybee.com', role: 'mx', display_name: 'Mx Person', kam_aliases: [] };
const cmOnly = { email: 'cm@carrybee.com', role: 'requester', display_name: 'CM', kam_aliases: [] };
const admin = { email: 'ad@carrybee.com', role: 'admin', display_name: 'Admin', kam_aliases: [] };
const noName = { email: 'n@carrybee.com', role: 'requester', display_name: '', kam_aliases: [] };
const issues = [
  { issue_id: 'CB-1', kam_name: 'Rahim Uddin' },
  { issue_id: 'CB-2', kam_name: 'rahim u.' },
  { issue_id: 'CB-3', kam_name: 'Sadia Noor' },
  { issue_id: 'CB-4', kam_name: 'CM' },
  { issue_id: 'CB-5', kam_name: null },
];

test('a KAM sees only the issues named to them (display name or alias)', () => {
  assert.deepEqual(visibleOpsIssues(kamA, issues).map((i) => i.issue_id), ['CB-1', 'CB-2']);
  assert.deepEqual(visibleOpsIssues(kamB, issues).map((i) => i.issue_id), ['CB-3']);
});

test('MX users see the issues named to them too', () => {
  assert.deepEqual(visibleOpsIssues(mxC, [{ issue_id: 'X', kam_name: 'Mx Person' }]).map((i) => i.issue_id), ['X']);
});

test('the CM queue name is not a person: no CM-named issue is visible to a user called CM', () => {
  assert.deepEqual(visibleOpsIssues(cmOnly, issues), []);
});

test('a user with no display name and no aliases sees nothing', () => {
  assert.deepEqual(visibleOpsIssues(noName, issues), []);
});

test('admin sees every issue', () => {
  assert.equal(visibleOpsIssues(admin, issues).length, issues.length);
});

test('no user (signed out) sees nothing', () => {
  assert.deepEqual(visibleOpsIssues(null, issues), []);
});

test('only the named KAM can edit KAM Feedback; admin and other KAMs cannot', () => {
  assert.equal(canEditKamFeedback(kamA, { kam_name: 'Rahim Uddin' }), true);
  assert.equal(canEditKamFeedback(kamA, { kam_name: 'rahim u.' }), true);
  assert.equal(canEditKamFeedback(kamB, { kam_name: 'Rahim Uddin' }), false);
  assert.equal(canEditKamFeedback(admin, { kam_name: 'Admin' }), false);
  assert.equal(canEditKamFeedback(noName, { kam_name: '' }), false);
});

test('cleanKamFeedback: trims, empty clears to null, too long and non-text are rejected', () => {
  assert.deepEqual(cleanKamFeedback('  Checked with hub  '), { value: 'Checked with hub' });
  assert.deepEqual(cleanKamFeedback('   '), { value: null });
  assert.deepEqual(cleanKamFeedback(null), { value: null });
  assert.ok(cleanKamFeedback('x'.repeat(KAM_FEEDBACK_MAX + 1)).error);
  assert.deepEqual(cleanKamFeedback('x'.repeat(KAM_FEEDBACK_MAX)).value.length, KAM_FEEDBACK_MAX);
  assert.ok(cleanKamFeedback(42).error);
});

test('withHubZone: zone comes from hub_master by hub name; no hub or unknown hub gives null', () => {
  const hubs = [{ hub_name: 'Mohakhali', zone: 'ISD' }, { hub_name: 'Chandpur-Sadar', zone: 'CTG' }];
  const out = withHubZone([
    { issue_id: 'A', hub_name: '  mohakhali ' },
    { issue_id: 'B', hub_name: 'Chandpur-Sadar' },
    { issue_id: 'C', hub_name: 'Not A Hub' },
    { issue_id: 'D', hub_name: null },
  ], hubs);
  assert.deepEqual(out.map((i) => [i.issue_id, i.zone]), [['A', 'ISD'], ['B', 'CTG'], ['C', null], ['D', null]]);
  assert.equal(withHubZone(null, hubs).length, 0);
});
