// Bell sound and OS alerts. Browser-only; the pure helpers are safe to import in Node tests.

export const SOUND_KEY = 'cb-sound';

// Sound is on unless the user muted it on this device. Default on.
export function soundEnabled(storage) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    return s ? s.getItem(SOUND_KEY) !== 'off' : true;
  } catch (e) { return true; }
}

export function setSoundEnabled(on, storage) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (s) s.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch (e) { /* private mode: keep the in-memory value only */ }
}

// Unread notifications that were not in the seen set. Read ones never alert.
export function freshUnread(items = [], seenIds = new Set()) {
  return items.filter((n) => !n.read_at && !seenIds.has(n.id));
}

// Two-note chime. Needs an AudioContext unlocked by a user gesture (see unlockAudio).
let ctx = null;

export function unlockAudio() {
  try {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* no audio support */ }
}

export function playChime() {
  try {
    if (!ctx || ctx.state !== 'running') return false;
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.18]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.4);
    });
    return true;
  } catch (e) { return false; }
}

// OS alerts: 'unsupported' (no Notification API, e.g. iPhone Safari tab), 'default', 'granted' or 'denied'.
export function osAlertState() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestOsAlerts() {
  if (osAlertState() === 'unsupported') return 'unsupported';
  return Notification.requestPermission();
}

// Shows one OS notification. Uses the service worker when present (Android Chrome needs it).
export async function showOsAlert(n) {
  if (osAlertState() !== 'granted') return false;
  try {
    const url = `/?open=${encodeURIComponent(n.issue_id)}`;
    const opts = { body: n.body || '', tag: `cb-${n.id}`, icon: '/icons/icon-192.png', data: { url } };
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) {
      await reg.showNotification(n.title, opts);
      return true;
    }
    const note = new Notification(n.title, opts);
    note.onclick = () => { window.focus(); window.location.href = url; };
    return true;
  } catch (e) { return false; }
}
