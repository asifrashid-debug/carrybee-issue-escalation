// Date range for the escalation tabs. Days are Asia/Dhaka calendar days (UTC+6, no daylight saving).
// Empty from and to means All time. Presets are recalculated from today, so "Last 7 days" stays current.
export const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '14d', label: 'Last 14 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
];
const ALL = { key: 'all', from: '', to: '' };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

// Dhaka date (YYYY-MM-DD). Bangladesh has been UTC+6 all year since 2009 (no daylight saving), so plain arithmetic
// gives the same date as Intl with Asia/Dhaka, about 40 times faster. tests/dhakaDay.test.mjs checks the two agree.
export function dhakaDay(d = new Date()) {
  return new Date(d.getTime() + 6 * 3600e3).toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function presetDates(key, now = new Date()) {
  const today = dhakaDay(now);
  if (key === 'today') return { from: today, to: today };
  if (key === '7d') return { from: addDays(today, -6), to: today };
  if (key === '14d') return { from: addDays(today, -13), to: today };
  if (key === '30d') return { from: addDays(today, -29), to: today };
  if (key === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return null;
}

// Turns a stored or URL value into { key, from, to }. Unknown or empty input means All time.
export function resolveRange(v, now = new Date()) {
  if (!v || typeof v !== 'object') return { ...ALL };
  if (v.key === 'custom') {
    let from = YMD.test(v.from || '') ? v.from : '';
    let to = YMD.test(v.to || '') ? v.to : '';
    if (!from && !to) return { ...ALL };
    if (from && to && from > to) [from, to] = [to, from];
    return { key: 'custom', from, to };
  }
  const p = presetDates(v.key, now);
  return p ? { key: v.key, ...p } : { ...ALL };
}

// Start (inclusive) and end (exclusive) as epoch milliseconds, or null for All time.
export function rangeBounds(r) {
  if (!r || (!r.from && !r.to)) return null;
  const start = r.from ? Date.parse(`${r.from}T00:00:00+06:00`) : null;
  const end = r.to ? Date.parse(`${r.to}T00:00:00+06:00`) + DAY : null;
  return { start, end };
}

// Number of days the trend should cover. All time keeps the 14-day view.
export function rangeDays(r, nowMs = Date.now()) {
  if (!r || (!r.from && !r.to)) return 14;
  const end = r.to ? Date.parse(`${r.to}T00:00:00+06:00`) + DAY : Date.parse(`${dhakaDay(new Date(nowMs))}T00:00:00+06:00`) + DAY;
  const start = r.from ? Date.parse(`${r.from}T00:00:00+06:00`) : end - 14 * DAY;
  return Math.min(366, Math.max(1, Math.round((end - start) / DAY)));
}

export function rangeLabel(r) {
  if (!r || r.key === 'all') return 'All time';
  const p = PRESETS.find((x) => x.key === r.key);
  if (p) return p.label;
  return `${r.from || '…'} to ${r.to || '…'}`;
}

// Lowercase phrase for sentences, e.g. "last 14 days" or "2026-11-01 to 2026-11-17".
export function rangePhrase(r) {
  if (!r || r.key === 'all') return 'all time';
  const p = PRESETS.find((x) => x.key === r.key);
  if (p) return p.label.toLowerCase();
  return `${r.from || '…'} to ${r.to || '…'}`;
}
