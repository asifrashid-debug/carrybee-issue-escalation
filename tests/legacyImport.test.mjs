import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLegacyRow, LEGACY_ID_RE } from '../lib/legacyImport.js';
import { lastFilledRow, findIssueRow, planAppend } from '../lib/sheetRows.js';

const HUBS = new Set(['CTG-Patiya', 'Sylhet-Sadar', 'B.Baria-Nabinagar', 'Barguna-Sadar']);
const good = (over = {}) => ({
  id: 'OLD-OSD-1A2B3C4D5E',
  timestamp: '2026-11-03T10:08:02+06:00',
  email: 'mahmud.hasan@carrybee.com',
  requester: 'F0929SJ34VG',
  channel: 'Contact center',
  zone: 'OSD',
  hub: 'CTG-Patiya',
  category: 'Execution Request',
  subCategory: 'Urgent Delivery',
  details: 'Customer location theke chole jaben tai onurodh korchen ajke parcelti delivery korar bebostha korte .',
  kamName: 'Mahmud Hasan',
  week: 'Week 45',
  priority: 'Urgent',
  kamFeedback: 'Solved',
  ...over,
});

test('valid row maps to an OLD escalation with consignment, MX channel, P2 and Closed', () => {
  const m = mapLegacyRow(good(), HUBS, 'OSD');
  assert.equal(m.ok, true);
  const e = m.esc;
  assert.equal(e.issue_id, 'OLD-OSD-1A2B3C4D5E');
  assert.equal(e.consignment_id, 'F0929SJ34VG');
  assert.equal(e.merchant_name, null);
  assert.equal(e.channel, 'MX');
  assert.equal(e.priority_scale, 'P2');
  assert.equal(e.kam_feedback_status, 'Resolved');
  assert.equal(e.issue_status, 'Closed');
  assert.equal(e.submitted_at, '2026-11-03T04:08:02.000Z');
  assert.equal(e.feedback_due_at, '2026-11-04T04:08:02.000Z');
});

test('Comments 1 maps to Layer 1 and Comments 2 maps to Layer 2; blanks become null', () => {
  const full = mapLegacyRow(good({ layer1: 'Hub infored', layer2: '  Cluster reply  ' }), HUBS, 'OSD').esc;
  assert.equal(full.layer1_response, 'Hub infored');
  assert.equal(full.layer2_response, 'Cluster reply');
  const blank = mapLegacyRow(good({ layer1: '', layer2: '#N/A' }), HUBS, 'OSD').esc;
  assert.equal(blank.layer1_response, null);
  assert.equal(blank.layer2_response, null);
});

test('a merchant name is stored as merchant, not consignment', () => {
  const m = mapLegacyRow(good({ requester: 'Swiftcart BD', id: 'OLD-OSD-0000000001' }), HUBS, 'OSD');
  assert.equal(m.ok, true);
  assert.equal(m.esc.merchant_name, 'Swiftcart BD');
  assert.equal(m.esc.consignment_id, null);
});

test('open status when KAM feedback is not resolved; blank feedback becomes Pending', () => {
  const pending = mapLegacyRow(good({ kamFeedback: '', id: 'OLD-OSD-0000000002' }), HUBS, 'OSD');
  assert.equal(pending.esc.kam_feedback_status, 'Pending');
  assert.equal(pending.esc.issue_status, 'Open');
  const notRes = mapLegacyRow(good({ kamFeedback: 'Not Resolved', id: 'OLD-OSD-0000000003' }), HUBS, 'OSD');
  assert.equal(notRes.esc.issue_status, 'Open');
});

test('RSD on the ISD tab is accepted as ISD', () => {
  const m = mapLegacyRow(good({ zone: 'RSD', id: 'OLD-ISD-0000000004', hub: 'Sylhet-Sadar' }), HUBS, 'ISD');
  assert.equal(m.ok, true);
  assert.equal(m.esc.zone, 'ISD');
});

test('rejects: unknown hub, bad channel, bad priority, On process, pre-cut-off, zone mismatch, bad id', () => {
  const cases = [
    [good({ hub: 'TNL' }), /hub 'TNL' not in hub_master/],
    [good({ channel: 'OPS' }), /channel OPS/],
    [good({ priority: 'Hot' }), /priority Hot/],
    [good({ kamFeedback: 'On process' }), /kam feedback 'On process'/],
    [good({ timestamp: '2026-10-02T10:08:02+06:00' }), /before cut-off/],
    [good({ zone: 'CTG' }), /zone CTG on OSD tab/],
    [good({ id: 'CB-18-11-ABCD' }), /bad id/],
  ];
  for (const [row, re] of cases) {
    const m = mapLegacyRow(row, HUBS, 'OSD');
    assert.equal(m.ok, false);
    assert.ok(m.reasons.some((r) => re.test(r)), `expected ${re} in ${m.reasons.join('; ')}`);
  }
});

test('legacy ID format is OLD-<ZONE>-<10 hex>', () => {
  assert.ok(LEGACY_ID_RE.test('OLD-CTG-ABCDEF0123'));
  assert.ok(!LEGACY_ID_RE.test('OLD-CTG-abcdef0123'));
  assert.ok(!LEGACY_ID_RE.test('CB-18-11-ABCD'));
});

const colA = (...ids) => [['Issue ID'], ...ids.map((id) => (id === null ? [] : [id]))];

test('lastFilledRow ignores trailing blanks and counts the header', () => {
  assert.equal(lastFilledRow([['Issue ID']]), 1);
  assert.equal(lastFilledRow(colA('CB-1', 'CB-2', '', '')), 3);
  assert.equal(lastFilledRow(colA('CB-1', null, 'CB-3')), 4);
});

test('planAppend puts new issues after the last filled row, contiguously, and updates existing ones', () => {
  const sheet = colA('CB-1', null, 'CB-3');
  const plan = planAppend(sheet, ['OLD-OSD-AAAAAAAAAA', 'CB-3', 'OLD-OSD-BBBBBBBBBB']);
  assert.deepEqual(plan, [
    { issue_id: 'OLD-OSD-AAAAAAAAAA', row: 5, action: 'appended' },
    { issue_id: 'CB-3', row: 4, action: 'updated' },
    { issue_id: 'OLD-OSD-BBBBBBBBBB', row: 6, action: 'appended' },
  ]);
});

test('findIssueRow returns the 1-based row or null', () => {
  assert.equal(findIssueRow(colA('CB-1', 'CB-2'), 'CB-2'), 3);
  assert.equal(findIssueRow(colA('CB-1'), 'CB-9'), null);
});
