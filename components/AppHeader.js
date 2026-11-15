'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

import { navFor } from '../lib/access';
import NotificationBell from './NotificationBell';

// Top bar with the tab names in a row underneath it. No side drawer: every tab is visible on web,
// and the row scrolls sideways on phones.
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

  return (
    <>
      <header className="glass topbar">
        <Link href="/dashboard" className="logo-chip" aria-label="CarryBee home"><img src="/carrybee-logo.png" alt="CarryBee" /></Link>
        <div className="live"><span className="dot" aria-hidden="true" />Issue Escalation Tracker · Dhaka {clock || '—'}</div>
        <div className="topbar-actions">
          {me && <span className="meta" title={`${me.email} · ${me.role}`} style={{ whiteSpace: 'nowrap' }}>{me.display_name || me.email} · {me.role}</span>}
          {links.length > 0 && <NotificationBell />}
          <button type="button" className="btn" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          <button type="button" className="btn" onClick={signOut}>Sign out</button>
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
