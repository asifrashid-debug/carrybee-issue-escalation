// Response Within: Layer 1/2/3 deadlines for an MX/CM/KAM issue, in Asia/Dhaka office hours.
// Office hours: 10:00-20:00 Asia/Dhaka, every day (no off day, holidays included).
//
// Start rule (clock start for Layer 1):
//   raised 12:00-19:59  -> starts at the raise time
//   raised 20:00-23:59  -> starts 12:00 the next day
//   raised 00:00-11:59  -> starts 12:00 the same day
//
// Deadlines (chained, office hours only):
//   Layer 1 = start + 1 office hour
//   Layer 2 = Layer 1 deadline + 2 office hours
//   Layer 3 = Layer 2 deadline + 2 office hours
//
// Pure module: no imports, no I/O.

const MIN = 60e3;
const H = 60 * MIN;
const DAY = 24 * H;
const DHAKA_OFFSET = 6 * H; // UTC+6, no DST

export const LAYER_STEP_HOURS = { 1: 1, 2: 2, 3: 2 };
const OPEN_MIN = 10 * 60;   // 10:00 Dhaka, minutes from midnight
const CLOSE_MIN = 20 * 60;  // 20:00 Dhaka
const START_MIN = 12 * 60;  // Layer 1 clock start for early/late raises

// Dhaka wall-clock minutes from midnight, and the Dhaka day start (UTC ms).
function dhakaParts(ms) {
  const local = ms + DHAKA_OFFSET;
  const dayStart = Math.floor(local / DAY) * DAY; // Dhaka midnight, in shifted ms
  return { dayStart, minutes: Math.floor((local - dayStart) / MIN) };
}

// Convert a Dhaka day start + minutes back to UTC ms.
function atDhaka(dayStart, minutes) {
  return dayStart + minutes * MIN - DHAKA_OFFSET;
}

// Layer 1 clock start for a raise time.
export function layerClockStart(submittedAt) {
  if (submittedAt == null || submittedAt === '') return null; // new Date(null) is the epoch, not invalid
  const t = new Date(submittedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const { dayStart, minutes } = dhakaParts(t);
  if (minutes >= START_MIN && minutes < CLOSE_MIN) return t;      // 12:00-19:59 starts now
  if (minutes >= CLOSE_MIN) return atDhaka(dayStart + DAY, START_MIN); // 20:00+ -> next day 12:00
  return atDhaka(dayStart, START_MIN);                             // 00:00-11:59 -> today 12:00
}

// Add office hours to a UTC ms timestamp, skipping closed time. Returns UTC ms.
export function addOfficeHours(startMs, hours) {
  let t = startMs;
  let remainingMs = Math.round(hours * H);
  // Move a closed start into the next open window.
  for (;;) {
    const { dayStart, minutes } = dhakaParts(t);
    if (minutes < OPEN_MIN) { t = atDhaka(dayStart, OPEN_MIN); continue; }
    if (minutes >= CLOSE_MIN) { t = atDhaka(dayStart + DAY, OPEN_MIN); continue; }
    const windowLeft = atDhaka(dayStart, CLOSE_MIN) - t;
    if (remainingMs <= windowLeft) return t + remainingMs;
    remainingMs -= windowLeft;
    t = atDhaka(dayStart + DAY, OPEN_MIN);
  }
}

// Deadlines for Layers 1-3. Returns { start, layer1, layer2, layer3 } as ISO strings, or null.
export function responseWithinDeadlines(submittedAt) {
  const start = layerClockStart(submittedAt);
  if (start == null) return null;
  const l1 = addOfficeHours(start, LAYER_STEP_HOURS[1]);
  const l2 = addOfficeHours(l1, LAYER_STEP_HOURS[2]);
  const l3 = addOfficeHours(l2, LAYER_STEP_HOURS[3]);
  return {
    start: new Date(start).toISOString(),
    layer1: new Date(l1).toISOString(),
    layer2: new Date(l2).toISOString(),
    layer3: new Date(l3).toISOString(),
  };
}

// Sheet text for the U column, e.g. "Layer 1 - 1:00 PM" (same Dhaka day as the raise)
// or "Layer 1 - 16 Nov 10:30 AM" when the deadline falls on another Dhaka day.
export function formatResponseWithin(submittedAt) {
  const d = responseWithinDeadlines(submittedAt);
  if (!d) return '';
  const raisedDay = Math.floor((new Date(submittedAt).getTime() + DHAKA_OFFSET) / DAY);
  const fmt = (iso, label) => {
    const ms = new Date(iso).getTime();
    const { dayStart, minutes } = dhakaParts(ms);
    const h24 = Math.floor(minutes / 60), mm = minutes % 60;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const time = `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
    const sameDay = dayStart / DAY === raisedDay;
    if (sameDay) return `${label} - ${time}`;
    const date = new Date(ms + DHAKA_OFFSET);
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()];
    return `${label} - ${date.getUTCDate()} ${mon} ${time}`;
  };
  return [fmt(d.layer1, 'Layer 1'), fmt(d.layer2, 'Layer 2'), fmt(d.layer3, 'Layer 3')].join(' | ');
}
