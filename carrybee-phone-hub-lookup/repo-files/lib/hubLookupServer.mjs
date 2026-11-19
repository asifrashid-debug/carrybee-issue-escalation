// Server-side hub lookup for the escalation form — works on any device, no browser extension.
//
// Two sources, in priority order:
// 1. Hive (real-time) — only when HIVE_API_URL is configured. This is the server-side version of
//    the "CarryBee Hive to Tracker" extension: the tracker itself asks a Hive endpoint for the
//    current hub of a Consignment ID.
// 2. Tracker history (always available) — the most recent escalation for the same Consignment ID,
//    from the escalations table. Works immediately, no configuration needed.
//
// The returned hub is untrusted text: the client compares it against the active hub list with
// matchActiveHub before anything is written to the form (same trust model as the extension path).
// Pure helpers are exported for tests; serverHubLookup takes injectable sb / env / fetchImpl.

import { isValidParcelId, normalizeParcelId } from './hubLookup.mjs';

const MAX_ERROR_LENGTH = 200;
const DEFAULT_HIVE_TIMEOUT_MS = 8000;

// Resolve a dot path (for example "data.currentHub") inside a JSON value.
// Returns the terminal as a trimmed string when it is a string or number, otherwise null.
export function extractByPath(value, dotPath) {
  if (value == null || !dotPath) return null;
  let cur = value;
  for (const part of String(dotPath).split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[part];
  }
  if (typeof cur === 'string') return cur.trim();
  if (typeof cur === 'number' && Number.isFinite(cur)) return String(cur);
  return null;
}

// Build the Hive request. HIVE_API_URL must contain {id}, replaced by the Consignment ID.
// HIVE_LOOKUP_METHOD: GET (default) or POST (the ID is also sent in a JSON body).
// HIVE_API_KEY is sent as a Bearer token when set.
export function buildHiveRequest(env, parcelId) {
  const url = String(env.HIVE_API_URL || '').replace(/\{id\}/g, encodeURIComponent(parcelId));
  const method = String(env.HIVE_LOOKUP_METHOD || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  const headers = {};
  if (env.HIVE_API_KEY) headers['authorization'] = `Bearer ${env.HIVE_API_KEY}`;
  if (method === 'POST') headers['content-type'] = 'application/json';
  return {
    url,
    method,
    headers,
    body: method === 'POST' ? JSON.stringify({ consignment_id: parcelId }) : undefined,
  };
}

// rows: [{ concern_hub, submitted_at }] sorted newest first.
// Returns the first row with a non-empty hub as { hub, at }, or null.
export function historyHubFromRows(rows) {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    const hub = r && typeof r.concern_hub === 'string' ? r.concern_hub.trim() : '';
    if (hub) return { hub, at: r.submitted_at || null };
  }
  return null;
}

// The whole server-side lookup. deps: { sb (supabase admin client), env, fetchImpl }.
// Resolves, never throws:
//   { hub, source: 'hive' | 'history' | null, history_at, hive_configured, error }
export async function serverHubLookup(parcelId, deps = {}) {
  const { sb, env = {}, fetchImpl = fetch } = deps;
  const id = normalizeParcelId(parcelId);
  if (!isValidParcelId(id)) {
    return { hub: null, source: null, history_at: null, hive_configured: false, error: 'Enter a valid Consignment ID first.' };
  }

  const hiveConfigured = !!env.HIVE_API_URL;
  let hiveHub = null;
  let hiveError = null;
  if (hiveConfigured) {
    try {
      const req = buildHiveRequest(env, id);
      const timeoutMs = Number(env.HIVE_TIMEOUT_MS || DEFAULT_HIVE_TIMEOUT_MS);
      const res = await fetchImpl(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        hiveHub = extractByPath(json, env.HIVE_HUB_JSON_PATH || 'hub');
        if (!hiveHub) hiveError = 'Hive returned no hub for this Consignment ID.';
      } else {
        hiveError = `Hive lookup failed (HTTP ${res.status}).`;
      }
    } catch (e) {
      hiveError = String(e && e.message ? e.message : e || 'Hive lookup failed.').slice(0, MAX_ERROR_LENGTH);
    }
  }

  let history = null;
  let historyError = null;
  if (sb) {
    const q = await sb
      .from('escalations')
      .select('concern_hub,submitted_at')
      .eq('consignment_id', id)
      .order('submitted_at', { ascending: false })
      .limit(5);
    if (q.error) historyError = String(q.error.message || 'Tracker history lookup failed.');
    else history = historyHubFromRows(q.data || []);
  }

  const hub = hiveHub || (history && history.hub) || null;
  return {
    hub,
    source: hiveHub ? 'hive' : history ? 'history' : null,
    history_at: history ? history.at : null,
    hive_configured: hiveConfigured,
    error: hub ? null : (hiveError || historyError || null),
  };
}
