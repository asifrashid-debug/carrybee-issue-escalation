'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

import { navFor } from '../lib/access';
import { buildSideNav } from '../lib/navGroups.mjs';
import SideNav from './SideNav';
import NotificationBell from './NotificationBell';
import { getMe } from './cw/meClient';
import { useOpsBadge } from './useOpsBadge';
import { useTrackerBadge } from './useTrackerBadge';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Demo header: logo left, icon buttons and initials-only sign-out on the right, sidebar on the left (groups open a flyout).
// Logic is unchanged: theme is saved in localStorage 'cb-theme' (light is the default), sign-out goes through Supabase.
export default function AppHeader() {
  const path = usePathname() || '/';
  const [theme, setTheme] = useState('light');
  const [me, setMe] = useState(null);
  const [now, setNow] = useState('');
  // New Ops Issues for this viewer (Raised and not yet seen). Only for users who can open the Ops-KAM tab.
  const opsEnabled = !!me && navFor(me.role).some((l) => l.tab === 'kam_issues');
  const opsCount = useOpsBadge(opsEnabled);
  // Tracker badge: MX issues named to this viewer with a Layer 1/2/3 response. Its own rule and seen list.
  const trackerEnabled = !!me && navFor(me.role).some((l) => l.tab === 'tracker');
  const trackerCount = useTrackerBadge(trackerEnabled);

  useEffect(() => {
    if (path === '/login') return undefined; // signed-out page: no /api/me call (it would return 401)
    let cancelled = false;
    getMe()
      .then((d) => { if (!cancelled && d) setMe(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const tick = () => setNow(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
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

  async function signOut() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await sb.auth.signOut();
    window.location.href = '/login';
  }

  if (path === '/login') return null;

  const links = me ? navFor(me.role) : [];
  const name = me ? (me.display_name || me.email) : '';
  const groups = buildSideNav(links);
  const activeTab = (() => {
    if (path === '/') return 'tracker';
    const hit = links.find((l) => l.href !== '/' && (path === l.href || path.startsWith(l.href + '/')));
    return hit ? hit.tab : null;
  })();

  return (
    <>
      <header className="hdr">
        <div className="hdrbar">
          <div className="brand">
            <Link href="/dashboard" aria-label="CarryBee home">
              <img className="logo" src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} alt="CarryBee" />
            </Link>
          </div>
          <div className="tools">
            <span className="time" aria-live="off">Dhaka {now}</span>
            {links.length > 0 && <NotificationBell />}
            <button type="button" className="ibtn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'} aria-pressed={theme === 'dark'} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: theme === 'light' ? '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' }} />
            </button>
            {me && (
              <button type="button" className="signout" onClick={signOut} aria-label={`Sign out, ${name}`} title="Sign out">
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                <b className="who-name" aria-hidden="true">{initials(name)}</b>
              </button>
            )}
          </div>
        </div>
      </header>

      {groups.length > 0 && (
        <SideNav
          groups={groups}
          activeTab={activeTab}
          counts={{ tracker: trackerCount, kam_issues: activeTab !== 'kam_issues' ? opsCount : 0 }}
        />
      )}
    </>
  );
}
