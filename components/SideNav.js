'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Dark drawer on the left. Pages are grouped (Reporting, KAM-OPS Tracker open inline with a chevron).
// Open/close: the top button collapses the drawer to an icon rail (desktop) or closes the overlay (phone).
// Sign out and the signed-in user sit at the bottom of the drawer.
// Data: groups from lib/navGroups.mjs (buildSideNav). The state lives in components/AppHeader.js.
const CHEV = <path d="m9 6 6 6-6 6" />;
const PANEL = <><path d="M4 5h16v14H4z" /><path d="M9 5v14" /></>;
const SIGN_OUT = <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>;

export default function SideNav({ groups = [], activeTab, counts = {}, user = null, collapsed = false, mobileOpen = false, onToggle, onCloseMobile, onSignOut }) {
  const activeGroupKey = groups.find((g) => g.type === 'group' && g.items.some((i) => i.tab === activeTab))?.key || null;
  const [openKeys, setOpenKeys] = useState(() => new Set(activeGroupKey ? [activeGroupKey] : []));

  // The group holding the open page starts expanded (and stays expanded when you navigate inside it)
  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenKeys((s) => (s.has(activeGroupKey) ? s : new Set([...s, activeGroupKey])));
  }, [activeGroupKey]);

  // Escape closes the phone overlay
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCloseMobile?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  function toggleGroup(key) {
    setOpenKeys((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  const badge = (n, label) => (n > 0 ? <span className="tab-badge" aria-label={`${n} ${label}`}>{n > 99 ? '99+' : n}</span> : null);
  const icon = (name) => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${name}`} /></svg>;

  return (
    <>
      <aside className={`side${mobileOpen ? ' is-open' : ''}`} aria-label="Navigation">
        <div className="side-top">
          <Link href="/dashboard" className="side-brand" aria-label="CarryBee home" onClick={onCloseMobile}>
            <img src="/logo-dark.png" alt="CarryBee" />
          </Link>
          <button
            type="button"
            className="side-toggle"
            onClick={onToggle}
            aria-label={collapsed ? 'Open menu' : 'Close menu'}
            title={collapsed ? 'Open menu' : 'Close menu'}
            aria-expanded={!collapsed}
          >
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{PANEL}</svg>
          </button>
        </div>

        <nav className="side-nav" aria-label="Pages">
          {groups.map((g) => {
            if (g.type === 'link') {
              const on = activeTab === g.tab;
              return (
                <Link key={g.key} href={g.href} className={`side-head${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} title={g.label} onClick={onCloseMobile}>
                  {icon(g.icon)}
                  <span className="side-lab">{g.label}</span>
                  {badge(counts[g.tab] || 0, 'new')}
                </Link>
              );
            }
            const on = g.items.some((i) => i.tab === activeTab);
            const n = g.items.reduce((s, i) => s + (counts[i.tab] || 0), 0);
            const isOpen = !collapsed && openKeys.has(g.key);
            return (
              <div key={g.key} className="side-group">
                <button
                  type="button"
                  className={`side-head${on ? ' grp-on' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={`side-sub-${g.key}`}
                  title={g.label}
                  onClick={() => (collapsed ? onToggle?.() : toggleGroup(g.key))}
                >
                  {icon(g.icon)}
                  <span className="side-lab">{g.label}</span>
                  {badge(n, 'new')}
                  <svg className={`ic side-chev${isOpen ? ' up' : ''}`} viewBox="0 0 24 24" aria-hidden="true">{CHEV}</svg>
                </button>
                {isOpen && (
                  <div id={`side-sub-${g.key}`} className="side-sub">
                    {g.items.map((i) => {
                      const sub = activeTab === i.tab;
                      return (
                        <Link key={i.tab} href={i.href} className={`side-item${sub ? ' on' : ''}`} aria-current={sub ? 'page' : undefined} onClick={onCloseMobile}>
                          <span>{i.label}</span>
                          {badge(counts[i.tab] || 0, 'new')}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {user && (
          <div className="side-foot">
            <div className="side-user">
              <span className="side-avatar" aria-hidden="true">{user.initials}</span>
              <span className="side-who">
                <b>{user.name}</b>
                <small>{user.email}</small>
              </span>
            </div>
            <button type="button" className="side-logout" onClick={onSignOut} aria-label={`Sign out, ${user.name}`} title="Sign out">
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{SIGN_OUT}</svg>
              <span>Log out</span>
            </button>
          </div>
        )}
      </aside>
      {mobileOpen && <div className="side-scrim" aria-hidden="true" onClick={onCloseMobile} />}
    </>
  );
}
