// IR category list, IR member dropdown, IR-only routing and per-category resolve SLA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IR_CATEGORIES } from '../lib/irCategoryList.mjs';
import {
  IR_MEMBERS, IR_PICK_SLA_HOURS_DEFAULT, isIrOnlyRoute, irResolveHours, irSlaCells,
} from '../lib/irEscalation.mjs';
import { irSheetSetupRequests, IR_MEMBER_COL_INDEX } from '../lib/irSheetSetup.mjs';

test('IR category list: 54 sub categories in 14 categories, unique pairs, valid priority and SLA days', () => {
  assert.equal(IR_CATEGORIES.length, 54);
  assert.equal(new Set(IR_CATEGORIES.map((c) => c.category)).size, 14);
  const pairs = new Set(IR_CATEGORIES.map((c) => `${c.category}|${c.sub_category}`));
  assert.equal(pairs.size, 54);
  for (const c of IR_CATEGORIES) {
    assert.ok(['Critical', 'Urgent', 'Regular'].includes(c.issue_type), c.issue_type);
    assert.ok(Number.isInteger(c.sla_days) && c.sla_days > 0, `${c.sub_category} sla_days`);
  }
});

test('spot checks against the CSV', () => {
  const find = (sub) => IR_CATEGORIES.find((c) => c.sub_category === sub);
  assert.deepEqual(find('Cash Hijacked During Delivery'), { category: 'Hijack / Robbery', sub_category: 'Cash Hijacked During Delivery', issue_type: 'Critical', sla_days: 5 });
  assert.deepEqual(find('Fake or Torn Note Received'), { category: 'Cash / COD Discrepancy', sub_category: 'Fake or Torn Note Received', issue_type: 'Urgent', sla_days: 3 });
  assert.deepEqual(find('Customer Fraud'), { category: 'Fraud & Misconduct', sub_category: 'Customer Fraud', issue_type: 'Regular', sla_days: 2 });
});

test('migration 024 inserts exactly the same rows as the category list', () => {
  const sql = readFileSync(new URL('../supabase/migrations/024_ir_categories.sql', import.meta.url), 'utf8');
  const re = /\(\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(Critical|Urgent|Regular)',\s*(\d+)\)/g;
  const found = [];
  for (const m of sql.matchAll(re)) found.push({ category: m[1].replace(/''/g, "'"), sub_category: m[2].replace(/''/g, "'"), issue_type: m[3], sla_days: Number(m[4]) });
  assert.equal(found.length, IR_CATEGORIES.length);
  const key = (c) => `${c.category}|${c.sub_category}|${c.issue_type}|${c.sla_days}`;
  assert.deepEqual(found.map(key).sort(), IR_CATEGORIES.map(key).sort());
});

test('IR member list has the five names, and the Apps Script uses the same list', () => {
  assert.deepEqual(IR_MEMBERS, ['Md Saidul Islam Siam', 'Parves Moshraf', 'Juman Nokrak', 'Fuad Hassan', 'Md Al Abid']);
  const gs = readFileSync(new URL('../apps-script/IR-Code.gs', import.meta.url), 'utf8');
  const m = gs.match(/const IR_MEMBERS = (\[[^\]]*\]);/);
  assert.ok(m, 'IR_MEMBERS in IR-Code.gs');
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), IR_MEMBERS);
});

test('the sheet setup sets a strict dropdown on Assigned IR Member (column M, rows 2-1000)', () => {
  assert.equal(IR_MEMBER_COL_INDEX, 12);
  const req = irSheetSetupRequests(0).find((r) => r.setDataValidation && r.setDataValidation.range.startColumnIndex === 12);
  assert.ok(req, 'member validation request');
  assert.equal(req.setDataValidation.range.startRowIndex, 1);
  assert.equal(req.setDataValidation.range.endRowIndex, 1000);
  assert.equal(req.setDataValidation.rule.condition.type, 'ONE_OF_LIST');
  assert.deepEqual(req.setDataValidation.rule.condition.values.map((v) => v.userEnteredValue), IR_MEMBERS);
  assert.equal(req.setDataValidation.rule.strict, true);
});

test('IR-only routing: IR ticked and HUB not ticked', () => {
  assert.equal(isIrOnlyRoute({ hub: false, ir: true, sort_tnl: false }), true);
  assert.equal(isIrOnlyRoute({ hub: true, ir: true, sort_tnl: false }), false);
  assert.equal(isIrOnlyRoute({ hub: true, ir: false, sort_tnl: false }), false);
  assert.equal(isIrOnlyRoute({ hub: false, ir: false, sort_tnl: true }), false);
});

test('resolve target: category days x 24, else IR_RESOLVE_SLA_HOURS, else null', () => {
  assert.equal(irResolveHours({ ir_resolve_sla_days: 5 }, {}), 120);
  assert.equal(irResolveHours({ ir_resolve_sla_days: null }, { IR_RESOLVE_SLA_HOURS: '48' }), 48);
  assert.equal(irResolveHours({ ir_resolve_sla_days: null }, {}), null);
});

test('IR-only issue: resolve SLA uses the category days (5 days = 120 hours)', () => {
  const base = { submitted_at: '2026-11-14T06:00:00Z', ir_picked_at: '2026-11-14T07:00:00Z', ir_resolve_sla_days: 5 };
  assert.deepEqual(irSlaCells({ ...base, ir_resolved_at: '2026-11-19T05:59:00Z' }, {}), { pick: 'Within SLA', resolve: 'Within SLA' });
  assert.deepEqual(irSlaCells({ ...base, ir_resolved_at: '2026-11-19T07:00:00Z' }, {}), { pick: 'Within SLA', resolve: 'Breached' });
});

test('pick SLA: 24 hours from the raised time (Picked stops the clock)', () => {
  assert.equal(IR_PICK_SLA_HOURS_DEFAULT, 24);
  const e = { submitted_at: '2026-11-14T06:00:00Z', ir_resolved_at: null };
  assert.deepEqual(irSlaCells({ ...e, ir_picked_at: '2026-11-15T05:59:00Z' }, {}).pick, 'Within SLA');
  assert.deepEqual(irSlaCells({ ...e, ir_picked_at: '2026-11-15T06:01:00Z' }, {}).pick, 'Breached');
  assert.deepEqual(irSlaCells({ ...e, ir_picked_at: null }, {}).pick, 'Pending');
});
