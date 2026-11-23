// Office hours for SLA clocks: 10:00-20:00 Asia/Dhaka (UTC+6, no DST), every day (no off day).
// In UTC that window is 04:00-14:00 each day. Only time inside the window counts toward the SLA.
const H_MS = 3600e3;
const DAY_MS = 24 * H_MS;
const OPEN_UTC_MS = 4 * H_MS;   // 10:00 Dhaka
const CLOSE_UTC_MS = 14 * H_MS; // 20:00 Dhaka

// Hours between two timestamps that fall inside office hours. Returns 0 if end <= start.
export function officeHoursBetween(startIso, endIso) {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  let total = 0;
  const firstDay = Math.floor(s / DAY_MS);
  const lastDay = Math.floor(e / DAY_MS);
  for (let d = firstDay; d <= lastDay; d++) {
    const winStart = d * DAY_MS + OPEN_UTC_MS;
    const winEnd = d * DAY_MS + CLOSE_UTC_MS;
    const overlap = Math.min(e, winEnd) - Math.max(s, winStart);
    if (overlap > 0) total += overlap;
  }
  return total / H_MS;
}
