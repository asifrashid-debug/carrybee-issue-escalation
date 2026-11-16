// Formatters and priority mapping for the demo-styled pages. Live priority codes map to the demo names:
// P1 = Critical (bee), P2 = Urgent (flare), P3 = Regular (mint), P4 = Regular.
export const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
export const fmtH = (v) => (v == null ? '—' : `${v}h`);
export const fmtPct = (v) => (v == null ? '—' : `${v}%`);
export const PRI_NAME = { P1: 'Critical', P2: 'Urgent', P3: 'Regular', P4: 'Regular' };
export const PRI_CLASS = { P1: 'p-crit', P2: 'p-urg', P3: 'p-reg', P4: 'p-reg' };
export const PRI_COLOR = { P1: '#FFCC00', P2: '#FF5470', P3: '#00E5A0', P4: '#00E5A0' };
export const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };

// HTML for a priority pill in the demo style, e.g. "P2 · Urgent".
export function priHTML(p) {
  if (!p) return '<span class="pill p-res">—</span>';
  return `<span class="pill ${PRI_CLASS[p] || 'p-reg'}">${p} · ${PRI_NAME[p] || ''}</span>`;
}
