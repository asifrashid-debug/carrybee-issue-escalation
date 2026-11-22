// Reads every row of a query in pages. PostgREST returns at most 1000 rows per request (and a plain
// select used to stop there without any error), so the page loop is the only safe way to read a large table.
// fetchPage(from, to) must return { data, error } for the inclusive range [from, to] and must use a stable order.
// maxRows caps the total. truncated is true when the read stopped at the cap while more rows may exist.
export async function readAllPages(fetchPage, { pageSize = 1000, maxRows = Infinity } = {}) {
  const rows = [];
  for (let from = 0; rows.length < maxRows; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message || String(error));
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { rows: rows.slice(0, maxRows), truncated: false };
  }
  return { rows: rows.slice(0, maxRows), truncated: true };
}
