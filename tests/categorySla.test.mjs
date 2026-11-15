import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexCategories, resolutionSla, resolutionCheck, DEFAULT_RESOLUTION_HOURS } from '../lib/categorySla.js';
import { computeAnalytics } from '../lib/analytics.js';

const H = 3600e3;
const NOW = new Date('2026-11-14T06:00:00Z').getTime();
const ago = (h) => new Date(NOW - h * H).toISOString();

const CATS = [
  { category: 'Inquiry', sub_category: 'Delivery/Return', side: 'requester', is_active: true, issue_type: 'Urgent', sla_isd: 10, sla_osd: 10, sla_ctg: 10 },
  { category: 'Charge Extra/Wrong COD', sub_category: 'Miscalculation Of Weight Charge', side: 'requester', is_active: true, issue_type: 'Critical', sla_isd: 1, sla_osd: 1, sla_ctg: 1 },
  { category: 'Damage', sub_category: 'Stapler Pin', side: 'requester', is_active: true, issue_type: 'Critical', sla_isd: 5, sla_osd: 7, sla_ctg: 7 },
  { category: 'Old', sub_category: 'Retired', side: 'requester', is_active: false, sla_isd: 2, sla_osd: 2, sla_ctg: 2 },
  { category: 'Ops', sub_category: 'Only ops', side: 'ops', is_active: true, sla_isd: 2, sla_osd: 2, sla_ctg: 2 },
];
const idx = indexCategories(CATS);

test('index keeps only active requester categories', () => {
  assert.equal(idx.size, 3);
  assert.equal(idx.has('Old\u0001Retired'), false);
  assert.equal(idx.has('Ops\u0001Only ops'), false);
});

test('SLA days follow the zone column', () => {
  const issue = { issue_category: 'Damage', issue_sub_category: 'Stapler Pin' };
  assert.equal(resolutionSla(idx, { ...issue, zone: 'ISD' }).days, 5);
  assert.equal(resolutionSla(idx, { ...issue, zone: 'OSD' }).days, 7);
  assert.equal(resolutionSla(idx, { ...issue, zone: 'CTG' }).days, 7);
  assert.equal(resolutionSla(idx, { ...issue, zone: 'ISD' }).source, 'category');
});

test('unmatched category or zone falls back to 72 hours', () => {
  const r = resolutionSla(idx, { issue_category: 'Nope', issue_sub_category: 'Nope', zone: 'ISD' });
  assert.equal(r.hours, DEFAULT_RESOLUTION_HOURS);
  assert.equal(r.source, 'default');
  assert.equal(resolutionSla(idx, { issue_category: 'Damage', issue_sub_category: 'Stapler Pin', zone: 'XYZ' }).source, 'default');
});

test('open issue past its days is a resolution breach; inside the window is not', () => {
  const base = { issue_category: 'Inquiry', issue_sub_category: 'Delivery/Return', zone: 'ISD', issue_status: 'Open', ops_issue_status: 'In Progress' };
  const late = resolutionCheck({ ...base, submitted_at: ago(11 * 24) }, idx, NOW);
  assert.equal(late.breach, true);
  assert.ok(late.overdueH > 0);
  const inside = resolutionCheck({ ...base, submitted_at: ago(9 * 24) }, idx, NOW);
  assert.equal(inside.breach, false);
  assert.equal(inside.days, 10);
});

test('resolved or closed issues are never resolution breaches', () => {
  const base = { issue_category: 'Inquiry', issue_sub_category: 'Delivery/Return', zone: 'ISD', submitted_at: ago(30 * 24) };
  assert.equal(resolutionCheck({ ...base, issue_status: 'Open', ops_issue_status: 'Resolved' }, idx, NOW).breach, false);
  assert.equal(resolutionCheck({ ...base, issue_status: 'Closed', ops_issue_status: 'In Progress' }, idx, NOW).breach, false);
});

test('analytics counts a resolution breach in KPI, zone and attention list', () => {
  const esc = {
    issue_id: 'ESC-1', submitted_at: ago(4 * 24), zone: 'OSD', concern_hub: 'Test Hub', email: 'a@x',
    issue_category: 'Charge Extra/Wrong COD', issue_sub_category: 'Miscalculation Of Weight Charge',
    issue_status: 'Open', ops_issue_status: 'In Progress', priority_scale: 'P1',
    issue_pick_time: ago(4 * 24 - 1), issue_response_datetime: ago(4 * 24 - 1),
  };
  // Category says 1 day in OSD, so 4 days old and still open is a breach. Without categories it would be inside 72h limit anyway.
  const withCats = computeAnalytics({ escalations: [esc], categories: CATS, now: new Date(NOW) });
  assert.equal(withCats.kpi.resolutionBreaches, 1);
  assert.equal(withCats.kpi.breaches, 1);
  assert.equal(withCats.zones.find((z) => z.zone === 'OSD').breaches, 1);
  const row = withCats.attention.find((a) => a.issue_id === 'ESC-1');
  assert.equal(row.kind, 'Resolution overdue');
  assert.equal(row.slaDays, 1);

  const noCats = computeAnalytics({ escalations: [esc], categories: [], now: new Date(NOW) });
  assert.equal(noCats.kpi.resolutionBreaches, 1, 'unmatched category falls back to 72h, 4 days is past it');
});
