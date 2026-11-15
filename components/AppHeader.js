'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

import { navFor } from '../lib/access';
import NotificationBell from './NotificationBell';

const ICON_MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
const ICON_SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const ICON_OUT = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>';

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: path }} />
  );
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Top bar: logo and name on the left; live clock, notifications, theme and sign-out on the right.
// The tab names sit centred in a row directly under the bar (every page). On phones the row scrolls sideways.
export default function AppHeader() {
  const path = usePathname() || '/';
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  // Light is the default. A saved choice (localStorage 'cb-theme') overrides it.
  const [theme, setTheme] = useState('light');
  const [clock, setClock] = useState('');
  const [me, setMe] = useState(null);

  // The header lives in the root layout, so it stays mounted across client navigation.
  // Re-read the session on every page change: after login (router.replace) the first read, made on /login, was a 401.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setMe(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });
    const tick = () => setClock(fmtTime.format(new Date()));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
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

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Link href="/dashboard" className="logo-link" aria-label="CarryBee home"><img src="/carrybee-logo.png" alt="CarryBee" /></Link>
          {me && <span className="divider" aria-hidden="true" />}
          {me && (
            <div className="who" title={`${me.email} · ${me.role}`}>
              <span className="avatar" aria-hidden="true">{initials(name)}</span>
              <span className="who-name">{name}</span>
            </div>
          )}
        </div>

        <div className="tools">
          <span className="live"><span className="dot" aria-hidden="true" />Dhaka {clock || '—'}</span>
          {links.length > 0 && <NotificationBell />}
          <button type="button" className="ibtn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            <Icon path={theme === 'light' ? ICON_MOON : ICON_SUN} />
          </button>
          <button type="button" className="signout" onClick={signOut} title={me ? `Sign out · ${me.role}` : 'Sign out'}>
            <Icon path={ICON_OUT} />
            <span className="txt"><b>Sign out</b>{me && <small>{me.role}</small>}</span>
          </button>
        </div>
      </header>

      {links.length > 0 && (
        <nav className="tabs" aria-label="Primary">
          {links.map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href) ? 'on' : ''} aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link>
          ))}
        </nav>
      )}
    </>
  );
}
