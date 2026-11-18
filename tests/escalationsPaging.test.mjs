// Tests the paging helper against a fake Supabase-style client that behaves like PostgREST:
// ordered by the requested columns, range() is inclusive, count is returned only when asked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllEscalations, PAGE } from '../lib/escalationsPaging.js';

function makeTable(n, { sameStamp = false, seed = 7 } = {}) {
  let a = seed;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const base = Date.parse('2026-11-01T00:00:00Z');
  return Array.from({ length: n }, (_, i) => ({
    issue_id: `CB-${String(i).padStart(6, '0')}`,
    submitted_at: new Date(sameStamp ? base : base + Math.floor(rnd() * 5) * 60000).toISOString(),
  }));
}

// Fake client. Records calls so the tests can check how many requests were made.
function fakeClient(table, { latencyMs = 0, dropCount = false, failAt = null } = {}) {
  const stats = { requests: 0, maxInFlight: 0, inFlight: 0 };
  const sorted = [...table].sort((x, y) => {
    if (x.submitted_at !== y.submitted_at) return x.submitted_at < y.submitted_at ? 1 : -1; // desc
    return x.issue_id < y.issue_id ? 1 : x.issue_id > y.issue_id ? -1 : 0; // desc
  });
  const client = {
    stats,
    from() {
      // The count option set by select() stays on the query, as it does in the real client.
      let wantCount = false;
      const q = { order() { return q; }, range(from, to) { return query(from, to, wantCount); } };
      return {
        select(_cols, opts) { wantCount = !!(opts && opts.count === 'exact'); return q; },
        order() { return q; },
        range(from, to) { return query(from, to, wantCount); },
      };
    },
  };
  function query(from, to, wantCount = false) {
    stats.requests++;
    stats.inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    const n = stats.requests;
    return new Promise((resolve) => setTimeout(() => {
      stats.inFlight--;
      if (failAt !== null && n === failAt) return resolve({ data: null, error: { message: 'boom' }, count: null });
      const data = sorted.slice(from, to + 1);
      resolve({ data, error: null, count: wantCount && !dropCount ? table.length : null });
    }, latencyMs));
  }
  return client;
}

const ids = (rows) => rows.map((r) => r.issue_id);
const expectedIds = (table) => [...table].sort((x, y) => {
  if (x.submitted_at !== y.submitted_at) return x.submitted_at < y.submitted_at ? 1 : -1;
  return x.issue_id < y.issue_id ? 1 : x.issue_id > y.issue_id ? -1 : 0;
}).map((r) => r.issue_id);

test('returns every row, once, in the same order as one long sequential read', async () => {
  for (const n of [0, 1, 999, 1000, 1001, 2500, 12345]) {
    const table = makeTable(n);
    const out = await fetchAllEscalations(fakeClient(table), 'x');
    assert.equal(out.error, undefined);
    assert.deepEqual(ids(out.rows), expectedIds(table), `n=${n}`);
  }
});

test('rows with identical timestamps are not skipped or repeated across pages', async () => {
  const table = makeTable(3500, { sameStamp: true });
  const out = await fetchAllEscalations(fakeClient(table), 'x');
  assert.equal(out.rows.length, 3500);
  assert.equal(new Set(ids(out.rows)).size, 3500);
  assert.deepEqual(ids(out.rows), expectedIds(table));
});

test('later pages are requested in parallel, not one after another', async () => {
  const table = makeTable(10000);
  const client = fakeClient(table, { latencyMs: 5 });
  await fetchAllEscalations(client, 'x');
  assert.equal(client.stats.requests, 11, 'first page + 9 parallel pages + 1 check for rows added during the read');
  assert.ok(client.stats.maxInFlight >= 5, `expected parallel requests, saw ${client.stats.maxInFlight}`);
});

test('without a count it reads until a short page, same result', async () => {
  for (const n of [0, 1000, 2500]) {
    const table = makeTable(n);
    const out = await fetchAllEscalations(fakeClient(table, { dropCount: true }), 'x');
    assert.deepEqual(ids(out.rows), expectedIds(table), `n=${n}`);
  }
});

test('an error on any page is returned, not swallowed', async () => {
  const table = makeTable(3000);
  const out = await fetchAllEscalations(fakeClient(table, { failAt: 3 }), 'x');
  assert.equal(out.error, 'boom');
  assert.equal(out.rows, undefined);
});

test('page size is 1000, the PostgREST default maximum the old code assumed', () => {
  assert.equal(PAGE, 1000);
});
