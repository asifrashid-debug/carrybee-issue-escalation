'use client';
import { useEffect, useState } from 'react';
import { PageHead, LiveChip, Zc, fmtN } from '../../components/demo';
import { formatDhaka } from '../../lib/time';

const TABS = [
  { key: 'hubs', label: 'Hub Master' },
  { key: 'cats', label: 'Category Master' },
  { key: 'users', label: 'Users & RBAC' },
  { key: 'sla', label: 'SLA & Policy' },
];
const PRI_BY_TYPE = { Critical: ['P1', 'p-crit'], Urgent: ['P2', 'p-urg'], Regular: ['P3', 'p-reg'] };

// Central Ops / Admin (demo layout). Masters are read from the database and shown as they are.
export default function Admin() {
  const [masters, setMasters] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('hubs');
  const [q, setQ] = useState('');

  async function load() {
    try {
      const r = await fetch('/api/masters', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMasters(j); setError(null);
    } catch (e) { setError(String(e.message || e)); }
  }
  useEffect(() => { load(); }, []);

  const hubs = masters?.hubs || [];
  const cats = masters?.categories || [];
  const users = masters?.users || [];
  const config = masters?.config || [];
  const term = q.trim().toLowerCase();
  const hubRows = hubs.filter((h) => !term || `${h.hub_name} ${h.zone || ''} ${h.regional_lead || ''}`.toLowerCase().includes(term));
  const tabLabel = (t) => {
    const n = { hubs: hubs.length, cats: cats.length, users: users.length, sla: config.length }[t.key];
    return n == null ? t.label : `${t.label} (${fmtN(n)})`;
  };

  return (
    <div className="dm">
      <PageHead title="Admin & Masters" sub="All hubs, category trees, RBAC scopes and SLA settings live in PostgreSQL config tables. Every change is written to the audit log.">
        <LiveChip label="Live · database" />
        <button type="button" className="btn" onClick={load} aria-label="Refresh">⟳ Refresh</button>
      </PageHead>

      {error && <div className="box box-bad" role="alert"><b>Could not load masters.</b> {error}</div>}

      <div className="card">
        <div className="admtabs" role="tablist" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => { setTab(t.key); setQ(''); }}>{tabLabel(t)}</button>
          ))}
        </div>

        {!masters && !error && <div className="empty">Loading masters…</div>}

        {masters && tab === 'hubs' && (
          <>
            <div className="search" style={{ maxWidth: 420, marginBottom: 12 }}>
              <input placeholder="Filter hubs by name, zone or regional lead…" aria-label="Filter hubs" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Hub Name</th><th>Zone</th><th>Division</th><th>Regional Lead</th><th>Status</th></tr></thead>
                <tbody>
                  {hubRows.length === 0 && <tr><td colSpan={5}><div className="empty">No hubs match this filter.</div></td></tr>}
                  {hubRows.slice(0, 200).map((h) => (
                    <tr key={h.hub_name}>
                      <td><b>{h.hub_name}</b></td>
                      <td><Zc z={h.zone} /></td>
                      <td>{h.division || '—'}</td>
                      <td>{h.regional_lead || '—'}</td>
                      <td><span className="pillc p-ok">Active</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note">Showing {fmtN(Math.min(200, hubRows.length))} of {fmtN(hubRows.length)} matching hubs. Hub changes are made in the database and shared with the zone sheets.</div>
          </>
        )}

        {masters && tab === 'cats' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Issue Category</th><th>Sub-category</th><th>Issue Type</th><th>Side</th><th>Status</th></tr></thead>
              <tbody>
                {cats.length === 0 && <tr><td colSpan={5}><div className="empty">No categories.</div></td></tr>}
                {cats.map((c) => {
                  const [p, cls] = PRI_BY_TYPE[c.issue_type] || ['—', 'p-reg'];
                  return (
                    <tr key={`${c.category}|${c.sub_category}`}>
                      <td>{c.category}</td>
                      <td>{c.sub_category}</td>
                      <td><span className={`pillc ${cls}`}>{c.issue_type ? `${p} · ${c.issue_type}` : '—'}</span></td>
                      <td className="mono">{c.side || '—'}</td>
                      <td><span className="pillc p-ok">Active</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {masters && tab === 'users' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Teams</th><th>Zone</th><th>Status</th></tr></thead>
              <tbody>
                {users.length === 0 && <tr><td colSpan={6}><div className="empty">No active users.</div></td></tr>}
                {users.map((u) => (
                  <tr key={u.email}>
                    <td><b>{u.display_name || u.email}</b></td>
                    <td className="mono">{u.email}</td>
                    <td className="mono">{u.role}</td>
                    <td>{(u.teams || []).join(', ') || '—'}</td>
                    <td>{u.zone || '—'}</td>
                    <td><span className={`pillc ${['hub_ops', 'regional_lead'].includes(u.role) ? 'p-B' : 'p-ok'}`}>{['hub_ops', 'regional_lead'].includes(u.role) ? 'Read-only' : 'Active'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {masters && tab === 'sla' && (
          <>
            <div className="grid g3" style={{ margin: 0 }}>
              {config.length === 0 && <div className="empty">No settings found in app_config.</div>}
              {config.map((c) => (
                <div key={c.key} className="card">
                  <div className="kl">{c.key.replace(/_/g, ' ')}</div>
                  <div className="kv" style={{ fontSize: 20, wordBreak: 'break-word' }}>{typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value)}</div>
                  {c.description && <div className="ks">{c.description}</div>}
                </div>
              ))}
            </div>
            <div className="note">Rules in force: first comment within 2 hours of being raised (breach if none), pick within 4 hours, resolution within the category's SLA days for the issue's zone (category master, counted from the time raised; 72 hours when a category has no SLA). KAM follow-up at 2.5 hours from raising; CM first follow-up 2.5 hours after pick, then every 2 hours. Edit settings in the app_config table.</div>
            <div className="note">Zone change is an admin action from the issue drawer, and it is audited. The old sheet row is marked MOVED and a new row is appended with the same Issue ID.</div>
          </>
        )}
      </div>
      <p className="note2">Last loaded {masters ? formatDhaka(new Date().toISOString()) : '—'} (Dhaka). Refresh to see the latest masters.</p>
    </div>
  );
}
