// Reads every escalation row for the analytics route.
// PostgREST returns at most 1000 rows per request, so the rows are read in pages of 1000.
// The first page also returns the total count, so the remaining pages are requested in parallel
// instead of one after another. Rows are ordered by submitted_at (newest first), then issue_id,
// so two rows with the same timestamp can never land on different pages, or be skipped or repeated.
//
// New rows can arrive while the pages are being read (escalation dumps). Each new row moves every later
// page down by one, so the same row can appear on two pages. Repeats are removed by issue_id.
// The total count is read again after the pages. If it changed (a row was removed), the read is repeated,
// up to MAX_ATTEMPTS. Updates do not move rows, so they do not cause a repeat.

export const PAGE = 1000;
export const MAX_ATTEMPTS = 5;

const ordered = (q) => q.order('submitted_at', { ascending: false }).order('issue_id', { ascending: false });
// Optional window on submitted_at, { start, end } in epoch ms (either may be null). Rows outside it are never read.
// The caller must still apply its exact filter afterwards; the window may only be looser than that filter.
const windowed = (q, win) => {
  if (win?.start != null) q = q.gte('submitted_at', new Date(win.start).toISOString());
  if (win?.end != null) q = q.lt('submitted_at', new Date(win.end).toISOString());
  return q;
};

// One pass over the table. Returns { rows, count }; count is null when the server returned no count.
async function readOnce(sb, cols, win) {
  const first = await ordered(windowed(sb.from('escalations').select(cols, { count: 'exact' }), win)).range(0, PAGE - 1);
  if (first.error) return { error: first.error.message };
  const firstRows = first.data || [];
  const rows = [...firstRows];

  // No count returned: fall back to reading until a short page, as before.
  if (first.count == null) {
    let page = firstRows;
    for (let from = PAGE; page.length === PAGE; from += PAGE) {
      const next = await ordered(windowed(sb.from('escalations').select(cols), win)).range(from, from + PAGE - 1);
      if (next.error) return { error: next.error.message };
      page = next.data || [];
      rows.push(...page);
    }
    return { rows, count: null };
  }

  const starts = [];
  for (let from = PAGE; from < first.count; from += PAGE) starts.push(from);
  const rest = await Promise.all(starts.map((from) =>
    ordered(windowed(sb.from('escalations').select(cols), win)).range(from, from + PAGE - 1)));
  for (const page of rest) {
    if (page.error) return { error: page.error.message };
    rows.push(...(page.data || []));
  }
  return { rows, count: first.count };
}

// Current total count (one small request).
async function countNow(sb, cols, win) {
  const r = await ordered(windowed(sb.from('escalations').select(cols, { count: 'exact' }), win)).range(0, 0);
  if (r.error) return { error: r.error.message };
  return { count: r.count };
}

// Removes repeated rows, keeping the first copy. A row added during a read can be seen twice, but never disappears.
function uniqueById(rows) {
  const seen = new Set();
  return rows.filter((r) => { if (seen.has(r.issue_id)) return false; seen.add(r.issue_id); return true; });
}

export async function fetchAllEscalations(sb, cols, win = null) {
  let rows = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const read = await readOnce(sb, cols, win);
    if (read.error) return { error: read.error };
    rows = read.rows;
    if (read.count == null) break;
    const now = await countNow(sb, 'issue_id', win);
    if (now.error) return { error: now.error };
    // Rows added during the read are fine (repeats are removed below). Only a drop means a row may have been missed.
    if (now.count >= read.count) break;
  }
  // After the last attempt, return what was read. A row deleted mid-read can be missed for one refresh; the next refresh corrects it.
  return { rows: uniqueById(rows) };
}
