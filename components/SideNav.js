'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Left sidebar: a rail of pages and groups. A group button opens a flyout with its pages (like the Orders menu).
// Data: groups from lib/navGroups.mjs (buildSideNav). counts: new-item badges by tab (tracker, kam_issues).
export default function SideNav({ groups = [], activeTab, counts = {} }) {
  const [openKey, setOpenKey] = useState(null);

  // Escape closes the flyout
  useEffect(() => {
    if (!openKey) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpenKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey]);

  const open = groups.find((g) => g.type === 'group' && g.key === openKey) || null;
  const badge = (n, label) => (n > 0 ? <span className="tab-badge" aria-label={`${n} ${label}`}>{n > 99 ? '99+' : n}</span> : null);

  return (
    <>
      <nav className="side" aria-label="Pages">
        {groups.map((g) => {
          if (g.type === 'link') {
            const on = activeTab === g.tab;
            return (
              <Link key={g.key} href={g.href} className={`side-btn${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} title={g.label}>
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${g.icon}`} /></svg>
                <span>{g.label}</span>
              </Link>
            );
          }
          const on = g.items.some((i) => i.tab === activeTab);
          const n = g.items.reduce((s, i) => s + (counts[i.tab] || 0), 0);
          const isOpen = open?.key === g.key;
          return (
            <button
              key={g.key}
              type="button"
              className={`side-btn${on ? ' on' : ''}`}
              aria-haspopup="true"
              aria-expanded={isOpen}
              aria-controls={`side-flyout-${g.key}`}
              title={g.label}
              onClick={() => setOpenKey(isOpen ? null : g.key)}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${g.icon}`} /></svg>
              <span>{g.label}</span>
              {badge(n, 'new')}
            </button>
          );
        })}
      </nav>
      {open && (
        <>
          <div className="side-scrim" aria-hidden="true" onClick={() => setOpenKey(null)} />
          <div className="side-flyout" id={`side-flyout-${open.key}`} role="region" aria-label={open.label}>
            <div className="side-flyout-h">{open.label}</div>
            {open.items.map((i) => {
              const on = activeTab === i.tab;
              return (
                <Link key={i.tab} href={i.href} className={`side-item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => setOpenKey(null)}>
                  <span>{i.label}</span>
                  {badge(counts[i.tab] || 0, 'new')}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
