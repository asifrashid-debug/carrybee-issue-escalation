// Central Sort and TNL response sheets: pure routing rules (no network). The row writer is in lib/sheets.js.
// Each route has its own sheet, set by an env var. The layout is the hub response sheet's 35 columns.

export const SORT_TNL_ROUTES = ['central_sort', 'tnl'];
export const SORT_TNL_LABELS = { central_sort: 'Central Sort', tnl: 'TNL' };
const ENV_BY_ROUTE = { central_sort: 'SHEET_CENTRAL_SORT', tnl: 'SHEET_TNL' };

// Spreadsheet ID for a route, or null when the route is unknown or its env var is not set.
export function sortTnlSheetId(route, env = process.env) {
  const name = ENV_BY_ROUTE[route];
  return name ? (env[name] || null) : null;
}
