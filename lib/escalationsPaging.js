// Reads every escalation row for the analytics route.
// PostgREST returns at most 1000 rows per request, so the rows are read in pages of 1000.
// The first page also returns the total count, so the remaining pages are requested in parallel
// instead of one after another. Rows are ordered by submitted_at (newest first), then issue_id,
// so two rows with the same timestamp can never land on different pages, or be skipped or repeated.
// Any rows added during the read are caught by a final sequential check.

export const PAGE = 1000;

export async function fetchAllEscalations(sb, cols) {
  const ordered = (q) => q.order('submitted_at', { ascending: false }).order('issue_id', { ascending: false });

  const first = await ordered(sb.from('escalations').select(cols, { count: 'exact' })).range(0, PAGE - 1);
  if (first.error) return { error: first.error.message };
  const firstRows = first.data || [];
  const rows = [...firstRows];

  // No count returned: fall back to reading until a short page, as before.
  if (first.count == null) {
    let page = firstRows;
    for (let from = PAGE; page.length === PAGE; from += PAGE) {
      const next = await ordered(sb.from('escalations').select(cols)).range(from, from + PAGE - 1);
      if (next.error) return { error: next.error.message };
      page = next.data || [];
      rows.push(...page);
    }
    return { rows };
  }

  const starts = [];
  for (let from = PAGE; from < first.count; from += PAGE) starts.push(from);
  const rest = await Promise.all(starts.map((from) =>
    ordered(sb.from('escalations').select(cols)).range(from, from + PAGE - 1)));
  for (const page of rest) {
    if (page.error) return { error: page.error.message };
    rows.push(...(page.data || []));
  }

  // Rows added while reading: keep reading until a short page.
  let last = rest.length ? rest[rest.length - 1].data || [] : firstRows;
  let from = starts.length ? starts[starts.length - 1] + PAGE : PAGE;
  while (last.length === PAGE) {
    const next = await ordered(sb.from('escalations').select(cols)).range(from, from + PAGE - 1);
    if (next.error) return { error: next.error.message };
    last = next.data || [];
    rows.push(...last);
    from += PAGE;
  }
  return { rows };
}
