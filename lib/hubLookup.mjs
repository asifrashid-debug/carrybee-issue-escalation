// Hub lookup for the escalation form ("Find current hub in Hive").
//
// The form asks the CarryBee Hive helper extension for the hub through window.postMessage. The
// extension's content script answers on the same window. Pure helpers (validation, message filter,
// hub matching) are exported for tests. requestHubLookup is the browser entry point and never rejects.
//
// Rules this module enforces:
// - Only messages from the same window (event.source === win) and the same origin are accepted.
// - A response is accepted only when its requestId matches the request that is waiting.
// - The returned hub is untrusted text. It is only ever compared against the active hub list,
//   and the form renders it as plain text.

export const PARCEL_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
export const LOOKUP_TIMEOUT_MS = 20000; // the 20 second limit from the spec
export const PING_TIMEOUT_MS = 1500;    // how long to wait for the extension to say it is installed
export const COOLDOWN_MS = 1000;        // the button stays disabled this long after each lookup

export const TIMEOUT_MESSAGE = 'Lookup timed out. Select the hub manually.';
export const NO_UNIQUE_MATCH_MESSAGE = "Couldn't match this hub uniquely. Select manually.";
export const MISSING_EXTENSION_MESSAGE =
  'The CarryBee Hive helper is not responding. Install or enable the "CarryBee Hive to Tracker" extension in Chrome, then reload this page. Until then, select the hub manually.';

const MAX_ERROR_LENGTH = 200;

// The Consignment ID is trimmed first, then checked against /^[a-zA-Z0-9_-]{1,80}$/.
export function normalizeParcelId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidParcelId(value) {
  return PARCEL_ID_RE.test(normalizeParcelId(value));
}

// Accept an incoming message only when it is a response to this request, from this window and origin.
export function isAcceptedMessage(event, { win, origin, requestId, type }) {
  if (!event || event.source !== win || event.origin !== origin) return false;
  const d = event.data;
  return !!d && typeof d === 'object' && d.type === type && d.requestId === requestId;
}

export function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Plain http pages (not a secure context) have no randomUUID. This fallback is only for those pages.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Hub names match case-insensitively and ignore leading/trailing spaces. Nothing else is changed,
// so "Comilla Daudkandi" does not match "Comilla-Daudkandi".
export function normalizeHubName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Match the hub text from Hive against ACTIVE hubs only.
// Returns { status: 'unique', hub } | { status: 'multiple', matches } | { status: 'none', matches: [] }.
// Duplicates (for example "Dhaka" and "dhaka") are not guessed between: they return 'multiple'.
export function matchActiveHub(hubName, hubs) {
  const want = normalizeHubName(hubName);
  const active = (Array.isArray(hubs) ? hubs : []).filter(
    (h) => h && h.is_active === true && typeof h.hub_name === 'string'
  );
  if (!want) return { status: 'none', matches: [] };
  const matches = active.filter((h) => normalizeHubName(h.hub_name) === want);
  if (matches.length === 1) return { status: 'unique', hub: matches[0] };
  return { status: matches.length > 1 ? 'multiple' : 'none', matches };
}

// Ask whether the extension is installed and listening. Resolves true or false. Never rejects.
export function pingExtension({ win, origin, timeoutMs = PING_TIMEOUT_MS, requestId = newRequestId() }) {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      win.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(ok);
    };
    function onMessage(event) {
      if (isAcceptedMessage(event, { win, origin, requestId, type: 'CARRYBEE_HUB_PONG' })) finish(true);
    }
    win.addEventListener('message', onMessage);
    timer = setTimeout(() => finish(false), timeoutMs);
    win.postMessage({ type: 'CARRYBEE_HUB_PING', requestId }, origin);
  });
}

// One lookup for one Consignment ID. Resolves to one of:
//   { kind: 'hub', hub }        the extension found a hub text (not yet matched against the list)
//   { kind: 'error', message }  the extension reported an error (for example: signed out of Hive)
//   { kind: 'timeout' }         no answer within timeoutMs (20 seconds by default)
//   { kind: 'missing' }         the extension did not answer the ping (not installed or not active)
// It never rejects, so the form can always leave its loading state.
export async function requestHubLookup(parcelId, opts = {}) {
  const { win, origin, timeoutMs = LOOKUP_TIMEOUT_MS, pingTimeoutMs = PING_TIMEOUT_MS } = opts;
  const id = normalizeParcelId(parcelId);
  if (!PARCEL_ID_RE.test(id)) return { kind: 'error', message: 'Enter a valid Consignment ID first.' };

  const installed = await pingExtension({ win, origin, timeoutMs: pingTimeoutMs });
  if (!installed) return { kind: 'missing' };

  const requestId = newRequestId();
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      win.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(result);
    };
    function onMessage(event) {
      if (!isAcceptedMessage(event, { win, origin, requestId, type: 'CARRYBEE_HUB_LOOKUP_RESPONSE' })) return;
      const d = event.data;
      if (typeof d.hub === 'string' && d.hub.trim()) {
        finish({ kind: 'hub', hub: d.hub.trim() });
      } else if (typeof d.error === 'string' && d.error.trim()) {
        finish({ kind: 'error', message: d.error.trim().slice(0, MAX_ERROR_LENGTH) });
      } else {
        finish({ kind: 'error', message: 'Hive returned no hub for this Consignment ID.' });
      }
    }
    win.addEventListener('message', onMessage);
    timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
    win.postMessage({ type: 'CARRYBEE_HUB_LOOKUP_REQUEST', requestId, parcelId: id }, origin);
  });
}
