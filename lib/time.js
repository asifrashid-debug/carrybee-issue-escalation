// All system timestamps stored UTC, displayed Asia/Dhaka (UTC+6), format dd-MMM-yyyy hh:mm AM/PM
export function formatDhaka(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  // Dhaka is UTC+6 with no DST: shift by a fixed 6h, independent of the viewer's timezone.
  const dhaka = new Date(d.getTime() + 6 * 60 * 60000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(dhaka.getUTCDate()).padStart(2,'0');
  const mmm = months[dhaka.getUTCMonth()];
  const yyyy = dhaka.getUTCFullYear();
  let h = dhaka.getUTCHours();
  const mm = String(dhaka.getUTCMinutes()).padStart(2,'0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${dd}-${mmm}-${yyyy} ${String(h).padStart(2,'0')}:${mm} ${ampm}`;
}
export function isoWeek(date = new Date()) {
  // ISO week in Dhaka date
  const d = new Date(date.getTime() + 6*60*60000);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((d - firstThu) / (7*24*3600*1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}
export function hoursSince(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}
