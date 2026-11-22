import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllEscalations, PAGE } from '../lib/escalationsPaging.js';

// Fake PostgREST-style client: applies gte/lt, order, range and exact counts, the way the real query does.
function fakeSb(rows) {
  return {
    from() {
      const filters = []; const orders = []; let range = null; let wantCount = false;
      const b = {
        select(_cols, opts) { wantCount = !!opts?.count; return b; },
        gte(col, v) { filters.push((r) => r[col] >= v); return b; },
        lt(col, v) { filters.push((r) => r[col] < v); return b; },
        order(col, { ascending = true } = {}) { orders.push({ col, asc: ascending }); return b; },
        range(from, to) {
          let data = rows.filter((r) => filters.every((f) => f(r)));
          const count = data.length;
          data = [...data].sort((x, y) => {
            for (const { col, asc } of orders) {
              if (x[col] === y[col]) continue;
              return (x[col] < y[col] ? -1 : 1) * (asc ? 1 : -1);
            }
            return 0;
          });
          return Promise.resolve({ data: data.slice(from, to + 1), error: null, count: wantCount ? count : null });
        },
      };
      return b;
    },
  };
}

// Timestamps spread across 60 days, in the same ISO format as the stored values.
function makeRows(n) {
  const base = Date.parse('2026-09-01T00:00:00Z');
  return Array.from({ length: n }, (_, i) => ({
    issue_id: `E${String(i).padStart(5, '0')}`,
    submitted_at: new Date(base + (i * 37 % 60) * 86400000 + (i * 977) % 86400000).toISOString(),
  }));
}

test('a windowed read returns exactly the rows inside the window', async () => {
  const rows = makeRows(2600);
  const start = Date.parse('2026-10-01T00:00:00Z');
  const end = Date.parse('2026-10-15T00:00:00Z');
  const { rows: got } = await fetchAllEscalations(fakeSb(rows), 'x', { start, end });
  const want = rows.filter((r) => { const t = Date.parse(r.submitted_at); return t >= start && t < end; });
  assert.deepEqual(new Set(got.map((r) => r.issue_id)), new Set(want.map((r) => r.issue_id)));
  assert.ok(got.length < rows.length);
});

test('a window spanning more than one page still reads every row in it', async () => {
  const rows = makeRows(2600);
  const start = Date.parse('2026-09-01T00:00:00Z');
  const end = Date.parse('2026-11-01T00:00:00Z');
  const want = rows.filter((r) => { const t = Date.parse(r.submitted_at); return t >= start && t < end; });
  assert.ok(want.length > PAGE, 'fixture must span more than one page');
  const { rows: got } = await fetchAllEscalations(fakeSb(rows), 'x', { start, end });
  assert.equal(new Set(got.map((r) => r.issue_id)).size, want.length);
});

test('an open-ended window (start only, end only) is applied on the open side only', async () => {
  const rows = makeRows(500);
  const start = Date.parse('2026-10-20T00:00:00Z');
  const { rows: onlyStart } = await fetchAllEscalations(fakeSb(rows), 'x', { start, end: null });
  assert.ok(onlyStart.every((r) => Date.parse(r.submitted_at) >= start));
  const end = Date.parse('2026-10-05T00:00:00Z');
  const { rows: onlyEnd } = await fetchAllEscalations(fakeSb(rows), 'x', { start: null, end });
  assert.ok(onlyEnd.every((r) => Date.parse(r.submitted_at) < end));
});

test('no window reads the whole table, as before', async () => {
  const rows = makeRows(2300);
  const { rows: got } = await fetchAllEscalations(fakeSb(rows), 'x');
  assert.equal(got.length, 2300);
  const { rows: got2 } = await fetchAllEscalations(fakeSb(rows), 'x', null);
  assert.equal(got2.length, 2300);
});
