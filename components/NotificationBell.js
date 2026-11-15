'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDhaka } from '../lib/time';

// Bell in the header: unread hub-response notifications for the signed-in user. Polls every 30 seconds.
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.data || []);
      setUnread(j.unread || 0);
    } catch (e) { /* offline: keep the last list */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

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
            {unread > 0 && <button type="button" className="bell-link" onClick={() => markRead({ all: true })}>Mark all read</button>}
          </div>
          {items.length === 0 && <div className="bell-empty">No hub responses yet.</div>}
          <ul>
            {items.map((n) => (
              <li key={n.id} className={n.read_at ? '' : 'new'}>
                <a href={`/?open=${encodeURIComponent(n.issue_id)}`} onClick={() => { if (!n.read_at) markRead({ ids: [n.id] }); setOpen(false); }}>
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
