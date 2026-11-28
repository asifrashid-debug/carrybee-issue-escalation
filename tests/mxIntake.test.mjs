import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitMxIssue } from '../lib/mxIntake.js';
import { validateMxIssue, requestHash } from '../lib/mxApi.mjs';

// Minimal chainable stand-in for the Supabase client. `answer(table, op)` returns { data, error } for each call.
// Every call is recorded in `log` so the tests can check what was written or released.
function fakeSb(answer) {
  const log = [];
  const sb = {
    log,
    from(table) {
      const q = { table, op: 'select', filters: [], single: false };
      const chain = {
        select() { if (q.op === 'select') q.op = 'select'; return chain; },
        insert(row) { q.op = 'insert'; q.row = row; return chain; },
        update(row) { q.op = 'update'; q.row = row; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(k, v) { q.filters.push(['eq', k, v]); return chain; },
        neq(k, v) { q.filters.push(['neq', k, v]); return chain; },
        is(k, v) { q.filters.push(['is', k, v]); return chain; },
        not() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        range() { return chain; },
        maybeSingle() { q.single = true; return chain; },
        single() { q.single = true; return chain; },
        then(resolve, reject) {
          log.push({ table, op: q.op, filters: q.filters, row: q.row });
          const res = answer(table, q.op, q) || { data: null, error: null };
          const out = q.single && Array.isArray(res.data) ? { ...res, data: res.data[0] ?? null } : res;
          return Promise.resolve(out).then(resolve, reject);
        },
      };
      return chain;
    },
    rpc() { return Promise.resolve({ data: 'CB-26-11-TEST', error: null }); },
  };
  return sb;
}

const clean = () => validateMxIssue({
  external_id: 'MXCRM-42',
  reporter_email: 'rahim@carrybee.com',
  consignment_id: 'CB999999',
  merchant_name: '',
  concern_hub: 'Mirpur Hub',
  issue_category: 'Delay',
  issue_sub_category: 'Late pickup',
  issue_details: 'Parcel was not picked up within the promised window.',
}).clean;

const dupInsert = { data: null, error: { code: '23505', message: 'duplicate key' } };

test('a new external_id with an unknown hub is rejected and the claim is released (retry is safe)', async () => {
  const c = clean();
  const sb = fakeSb((table, op) => {
    if (table === 'mx_api_requests' && op === 'insert') return { data: null, error: null };
    if (table === 'app_config') return { data: null, error: null };
    if (table === 'hub_master') return { data: null, error: null };
    return { data: null, error: null };
  });
  const out = await submitMxIssue(c, requestHash(c), sb);
  assert.equal(out.status, 400);
  assert.equal(out.body.errors[0].field, 'concern_hub');
  const released = sb.log.find((l) => l.table === 'mx_api_requests' && l.op === 'delete');
  assert.ok(released, 'claim must be deleted so the CRM can retry');
  assert.deepEqual(released.filters, [['eq', 'external_id', 'MXCRM-42'], ['is', 'issue_id', null]]);
});

test('same external_id and same content replays the existing issue (200, no new row)', async () => {
  const c = clean();
  const hash = requestHash(c);
  const sb = fakeSb((table, op) => {
    if (table === 'mx_api_requests' && op === 'insert') return dupInsert;
    if (table === 'mx_api_requests' && op === 'select') return { data: { request_hash: hash, issue_id: 'CB-26-11-7' }, error: null };
    if (table === 'escalations' && op === 'select') return { data: { issue_id: 'CB-26-11-7', submitted_at: 'x', zone: 'ISD', concern_hub: 'Mirpur Hub', kam_name: 'CM', issue_status: 'Open', ops_issue_status: 'New', ops_status: 'Pending', route_hub: true }, error: null };
    return { data: null, error: null };
  });
  const out = await submitMxIssue(c, hash, sb);
  assert.equal(out.status, 200);
  assert.equal(out.body.issue_id, 'CB-26-11-7');
  assert.equal(out.body.replayed, true);
  assert.equal(out.body.routes.hub, true);
  assert.equal(sb.log.some((l) => l.table === 'escalations' && l.op === 'insert'), false, 'no new issue on replay');
});

test('same external_id with different content is a conflict (409), nothing written', async () => {
  const c = clean();
  const sb = fakeSb((table, op) => {
    if (table === 'mx_api_requests' && op === 'insert') return dupInsert;
    if (table === 'mx_api_requests' && op === 'select') return { data: { request_hash: 'different-hash', issue_id: 'CB-26-11-7' }, error: null };
    return { data: null, error: null };
  });
  const out = await submitMxIssue(c, requestHash(c), sb);
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'external_id_conflict');
  assert.equal(sb.log.some((l) => l.table === 'escalations'), false);
});

test('a request still being processed (claim without an issue) returns 409 in_progress', async () => {
  const c = clean();
  const hash = requestHash(c);
  const sb = fakeSb((table, op) => {
    if (table === 'mx_api_requests' && op === 'insert') return dupInsert;
    if (table === 'mx_api_requests' && op === 'select') return { data: { request_hash: hash, issue_id: null }, error: null };
    return { data: null, error: null };
  });
  const out = await submitMxIssue(c, hash, sb);
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'in_progress');
});

test('a database error on the claim is thrown (not silently treated as a new issue)', async () => {
  const c = clean();
  const sb = fakeSb((table, op) => {
    if (table === 'mx_api_requests' && op === 'insert') return { data: null, error: { code: '08006', message: 'connection failure' } };
    return { data: null, error: null };
  });
  await assert.rejects(() => submitMxIssue(c, requestHash(c), sb), /connection failure/);
  assert.equal(sb.log.some((l) => l.table === 'escalations'), false);
});

test('a failure after the issue is saved keeps the claim, so a retry replays and does not duplicate', async () => {
  const c = clean();
  const hash = requestHash(c);
  let inserted = false;
  const sb = fakeSb((table, op) => {
    if (table === 'app_config') return { data: null, error: null };
    if (table === 'hub_master') return { data: { hub_name: 'Mirpur Hub', zone: 'ISD', regional_lead: 'x', division: 'y' }, error: null };
    if (table === 'category_master') return { data: { issue_type: 'Regular' }, error: null };
    if (table === 'mx_api_requests' && op === 'insert') return { data: null, error: null };
    if (table === 'escalations' && op === 'insert') { inserted = true; return { data: { issue_id: 'CB-26-11-9', submitted_at: 'x', zone: 'ISD', concern_hub: 'Mirpur Hub', kam_name: 'CM', issue_status: 'Open', ops_issue_status: 'New', ops_status: 'Pending', route_hub: true }, error: null }; }
    if (table === 'escalations' && op === 'select') return { data: { issue_id: 'CB-26-11-9', submitted_at: 'x', zone: 'ISD', concern_hub: 'Mirpur Hub', kam_name: 'CM', issue_status: 'Open', ops_issue_status: 'New', ops_status: 'Pending', route_hub: true }, error: null };
    return { data: null, error: null };
  });
  // Force a failure after the insert: the sheet write is not reached because the audit insert throws.
  const orig = sb.from.bind(sb);
  sb.from = (table) => {
    const chain = orig(table);
    if (table === 'audit_log') { const ins = chain.insert; chain.insert = () => { throw new Error('audit exploded'); }; void ins; }
    return chain;
  };
  const out = await submitMxIssue(c, hash, sb).catch((e) => ({ thrown: e.message }));
  assert.ok(inserted, 'issue row was written');
  assert.equal(out.thrown, undefined, 'the saved issue is reported as success, not an error');
  assert.equal(out.status, 201);
  assert.equal(sb.log.some((l) => l.table === 'mx_api_requests' && l.op === 'delete'), false, 'claim must not be released');
  assert.equal(sb.log.some((l) => l.table === 'mx_api_requests' && l.op === 'update'), true, 'claim is attached to the issue');
});
