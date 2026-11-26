// Central Sort and TNL writes go through each response sheet's own Apps Script web app (doPost in the .gs file).
// The sheet owner's Apps Script does the write, so these sheets need no Google login in Vercel.
// Each route has its own web app URL, and that URL is bound to one sheet.
import { colLetter } from './sheetRows.js';

export const ROUTE_SCRIPT_ENV = { central_sort: 'ROUTE_SCRIPT_URL_CENTRAL_SORT', tnl: 'ROUTE_SCRIPT_URL_TNL' };

// Web app URL for a route, or null when the route is unknown or its env var is not set.
export function routeScriptUrl(route, env = process.env) {
  const name = ROUTE_SCRIPT_ENV[route];
  return name ? (env[name] || null) : null;
}

// Column U (Response Within) is a sheet formula. The app never writes it, so it is dropped here as well.
const SKIP_COLS = new Set(['U']);

// Row array from escToRow() (index 0 = column A) -> { A: value, ... }.
export function rowToCells(row) {
  const cells = {};
  row.forEach((v, idx) => {
    const col = colLetter(idx);
    if (!SKIP_COLS.has(col)) cells[col] = v === undefined || v === null ? '' : v;
  });
  return cells;
}

// cellPlan() entries -> { col: value }.
export function cellsFromPlan(plan) {
  const cells = {};
  for (const c of plan) if (!SKIP_COLS.has(c.col)) cells[c.col] = c.value === undefined || c.value === null ? '' : c.value;
  return cells;
}

// POST one request to a route's web app. The secret and the route are added here, never taken from the caller.
// Errors never include the secret or the URL.
export async function callRouteScript(route, payload, { env = process.env, fetchImpl = fetch } = {}) {
  const url = routeScriptUrl(route, env);
  if (!url) throw new Error(`No script URL set for ${route}`);
  const secret = env.ROUTE_SCRIPT_SECRET;
  if (!secret) throw new Error('ROUTE_SCRIPT_SECRET is not set');
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, secret, sheet_route: route }),
    redirect: 'follow',
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Route script returned a non-JSON reply (HTTP ${res.status}) for ${route}`); }
  if (!res.ok || json.error) throw new Error(`Route script ${route}: ${json.error || `HTTP ${res.status}`}`);
  return json;
}
