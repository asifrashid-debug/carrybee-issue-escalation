'use client';
// One shared /api/me request per 60 seconds per tab, instead of one per component and on every page change.
const TTL = 60000;
let value = null, at = 0, pending = null;

export function getMe() {
  if (value && Date.now() - at < TTL) return Promise.resolve(value);
  if (!pending) {
    pending = fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { value = d; at = Date.now(); } return d; })
      .finally(() => { pending = null; });
  }
  return pending;
}
