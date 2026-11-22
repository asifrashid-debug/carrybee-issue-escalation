'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDhaka } from '../lib/time';
import { freshUnread, soundEnabled, setSoundEnabled, unlockAudio, playChime, osAlertState, requestOsAlerts, showOsAlert } from '../lib/notifySound';
import { useVisibleInterval } from './cw/useVisibleInterval';

// Bell in the header: unread notifications for the signed-in user (hub responses and new CM issues).
// Polls every 30 seconds, including in background tabs, so OS alerts can fire while the tracker is not in front.
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const [osState, setOsState] = useState('unsupported');
  const wrap = useRef(null);
  // null until the first load: existing notifications are recorded silently, so opening the page does not chime.
  const seen = useRef(null);
  const soundOn = useRef(true);

  useEffect(() => {
    const on = soundEnabled();
    setSound(on);
    soundOn.current = on;
    setOsState(osAlertState());
  }, []);

  const alertFor = useCallback((fresh) => {
    if (!soundOn.current || !fresh.length) return;
    if (typeof document !== 'undefined' && document.hidden) {
      // Background tab: OS notification (plays the system sound). Only the newest one, to avoid a burst.
      showOsAlert(fresh[0]);
    } else {
      playChime();
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const list = j.data || [];
      if (seen.current === null) {
        seen.current = new Set(list.map((n) => n.id));
      } else {
        const fresh = freshUnread(list, seen.current);
        list.forEach((n) => seen.current.add(n.id));
        alertFor(fresh);
      }
      setItems(list);
      setUnread(j.unread || 0);
    } catch (e) { /* offline: keep the last list */ }
  }, [alertFor]);

  useEffect(() => { load(); }, [load]);
  useVisibleInterval(load, 30000);

  // Browsers only let audio start after a user gesture. The first tap or key press unlocks it.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Close when clicking outside the bell.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markRead(body) {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    soundOn.current = next;
    setSoundEnabled(next);
    unlockAudio();
    if (next) playChime();
  }

  async function enableOs() {
    const res = await requestOsAlerts();
    setOsState(res);
  }

  const osLine = osState === 'granted'
    ? 'Desktop alerts on.'
    : osState === 'denied'
      ? 'Desktop alerts are blocked in browser settings.'
      : osState === 'default'
        ? null
        : 'Desktop alerts need Chrome, Edge or Firefox, or the app installed on your phone home screen.';

  return (
    <div className="bell" ref={wrap}>
      <button
        type="button"
        className="bell-btn"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open) load(); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            <span>
              <button type="button" className="bell-link" aria-pressed={sound} onClick={toggleSound}>
                {sound ? 'Sound on' : 'Sound off'}
              </button>
              {unread > 0 && <button type="button" className="bell-link" onClick={() => markRead({ all: true })}>Mark all read</button>}
            </span>
          </div>
          {osState === 'default' && (
            <div className="bell-empty">
              <button type="button" className="bell-link" onClick={enableOs}>Turn on desktop alerts</button>
            </div>
          )}
          {osLine && <div className="bell-empty">{osLine}</div>}
          {items.length === 0 && <div className="bell-empty">No notifications yet.</div>}
          <ul>
            {items.map((n) => (
              <li key={n.id} className={n.read_at ? '' : 'new'}>
                <a href={n.kind === 'ops_issue_raised' ? '/kam/issues' : `/?open=${encodeURIComponent(n.issue_id)}`} onClick={() => { if (!n.read_at) markRead({ ids: [n.id] }); setOpen(false); }}>
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="bell-body">{n.body}</span>}
                  <span className="bell-time">{formatDhaka(n.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
