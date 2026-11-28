// Central Sort and TNL response sheets: pure routing rules (no network). The row writer is in lib/sheets.js.
// Each route has its own sheet, set by an env var. The layout is the hub response sheet's 35 columns.

export const SORT_TNL_ROUTES = ['central_sort', 'tnl'];
export const SORT_TNL_LABELS = { central_sort: 'Central Sort', tnl: 'TNL' };
const ENV_BY_ROUTE = { central_sort: 'SHEET_CENTRAL_SORT', tnl: 'SHEET_TNL' };

// Routes written straight to their sheet with the Sheets API (the same Google token the hub uses).
// TNL uses this: its Apps Script web app returns HTTP 401 to the server, so the web app cannot be used.
// Central Sort still uses its web app (routeScript.mjs), which works.
export const DIRECT_WRITE_ROUTES = ['tnl'];
export function usesDirectWrite(route) {
  return DIRECT_WRITE_ROUTES.includes(route);
}

// Spreadsheet ID for a route, or null when the route is unknown or its env var is not set.
export function sortTnlSheetId(route, env = process.env) {
  const name = ENV_BY_ROUTE[route];
  return name ? (env[name] || null) : null;
}
