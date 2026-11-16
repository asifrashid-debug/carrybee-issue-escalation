'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

import { navFor, tabForPath } from '../lib/access';
import NotificationBell from './NotificationBell';

// Icon paths (24px grid, 1.75 stroke). Kept inline so the header needs no extra files.
const P = {
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  list: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  pin: '<path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
};

function Icon({ path, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: path }} />
  );
}

// Initials only. The full name is never printed in the header (it is kept in aria-label).
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Phone bottom bar: four items. Anything else lives under More.
const BOTTOM = [
  { tab: 'overview', label: 'Home', href: '/dashboard', icon: P.home },
  { tab: 'tracker', label: 'Tracker', href: '/', icon: P.list },
  { tab: 'hubs', label: 'Hubs', href: '/hubs', icon: P.pin },
];

// Top bar: logo left; notifications, theme and sign-out on the right. Plain bar.
// Folder tabs sit under the bar on wide screens. On phones they become a bottom bar with More.
export default function AppHeader() {
  const path = usePathname() || '/';
  const activeTab = tabForPath(path);
  // Light is the default. A saved choice (localStorage 'cb-theme') overrides it.
  const [theme, setTheme] = useState('light');
  const [me, setMe] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setMe(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => { setMoreOpen(false); }, [path]);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cb-theme', next); } catch (e) { /* storage unavailable: keep in-memory choice */ }
    setTheme(next);
  }

  if (path === '/login') return null;

  async function signOut() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await sb.auth.signOut();
    window.location.href = '/login';
  }

  const links = me ? navFor(me.role) : [];
  const name = me ? (me.display_name || me.email) : '';
  const bottom = BOTTOM.filter((b) => links.some((l) => l.tab === b.tab));
  const more = links.filter((l) => !bottom.some((b) => b.tab === l.tab));
  const isOn = (tab) => activeTab === tab;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Link href="/dashboard" className="logo-link" aria-label="CarryBee home"><img src="/carrybee-logo.png" alt="CarryBee" /></Link>
        </div>

        <div className="tools">
          {links.length > 0 && <NotificationBell />}
          <button type="button" className="ibtn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            <Icon path={theme === 'light' ? P.moon : P.sun} />
          </button>
          <button
            type="button"
            className="signout"
            onClick={signOut}
            aria-label={me ? `Sign out, ${name}, ${me.role}` : 'Sign out'}
            title={me ? `Sign out · ${me.role}` : 'Sign out'}
          >
            <Icon path={P.out} />
            {me && <b className="ini" aria-hidden="true">{initials(name)}</b>}
            {me && <span className="role" aria-hidden="true">{me.role}</span>}
          </button>
        </div>
      </header>

      {links.length > 0 && (
        <nav className="folders" aria-label="Primary">
          {links.map((n) => (
            <Link key={n.href} href={n.href} className={isOn(n.tab) ? 'on' : ''} aria-current={isOn(n.tab) ? 'page' : undefined}>{n.label}</Link>
          ))}
        </nav>
      )}

      {links.length > 0 && (
        <nav className="bottombar" aria-label="App">
          {bottom.map((b) => (
            <Link key={b.tab} href={b.href} className={isOn(b.tab) ? 'on' : ''} aria-current={isOn(b.tab) ? 'page' : undefined}>
              <span className="bb-ic"><Icon path={b.icon} size={22} /></span>
              <span>{b.label}</span>
            </Link>
          ))}
          {more.length > 0 && (
            <button type="button" className={moreOpen ? 'on' : ''} aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen(!moreOpen)}>
              <span className="bb-ic"><Icon path={P.more} size={22} /></span>
              <span>More</span>
            </button>
          )}
        </nav>
      )}

      {moreOpen && (
        <div className="more-wrap" id="more-sheet">
          <button type="button" className="more-scrim" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="more-sheet" role="dialog" aria-modal="true" aria-label="More pages">
            <div className="more-grab" aria-hidden="true" />
            <div className="more-head">
              <span className="more-av" aria-hidden="true">{initials(name)}</span>
              <div className="more-who"><b>{me?.role}</b><span>Signed in</span></div>
            </div>
            <div className="more-list">
              {more.map((n) => (
                <Link key={n.href} href={n.href} className={isOn(n.tab) ? 'on' : ''}>{n.label}</Link>
              ))}
            </div>
            <div className="more-list">
              <button type="button" onClick={toggleTheme}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</button>
              <button type="button" className="danger" onClick={signOut} aria-label={`Sign out, ${name}, ${me?.role || ''}`}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
