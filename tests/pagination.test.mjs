import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAllPages } from '../lib/pagination.mjs';

// Fake table: returns rows [from, to] like PostgREST, and never more than 1000 per request.
function fakeFetch(n, { failAt = null } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  let calls = 0;
  const fetchPage = async (from, to) => {
    calls++;
    if (failAt !== null && calls === failAt) return { data: null, error: { message: 'boom' } };
    return { data: rows.slice(from, Math.min(to, from + 999) + 1), error: null };
  };
  return { fetchPage, calls: () => calls };
}

test('reads every row of a table bigger than one page', async () => {
  const f = fakeFetch(2350);
  const { rows, truncated } = await readAllPages(f.fetchPage);
  assert.equal(rows.length, 2350);
  assert.equal(rows[2349].id, 2349);
  assert.equal(truncated, false);
  assert.equal(f.calls(), 3);
});

test('an exact multiple of the page size stops on the short (empty) page', async () => {
  const f = fakeFetch(2000);
  const { rows, truncated } = await readAllPages(f.fetchPage);
  assert.equal(rows.length, 2000);
  assert.equal(truncated, false);
});

test('empty table returns no rows', async () => {
  const { rows, truncated } = await readAllPages(fakeFetch(0).fetchPage);
  assert.deepEqual(rows, []);
  assert.equal(truncated, false);
});

test('maxRows caps the read and reports truncation', async () => {
  const { rows, truncated } = await readAllPages(fakeFetch(5000).fetchPage, { maxRows: 1500 });
  assert.equal(rows.length, 1500);
  assert.equal(truncated, true);
});

test('a query error is thrown, never returned as a partial result', async () => {
  await assert.rejects(readAllPages(fakeFetch(2500, { failAt: 2 }).fetchPage), /boom/);
});
