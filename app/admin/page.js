'use client';
import { useEffect, useMemo, useState } from 'react';
import { fmtN } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';

const TABS = [
  { key: 'hubs', label: 'Hub Master' },
  { key: 'cats', label: 'Category Master' },
  { key: 'users', label: 'Users & RBAC' },
  { key: 'sla', label: 'SLA & Policy' },
];
const PRI_BY_TYPE = { Critical: ['P1', 'pill p-crit'], Urgent: ['P2', 'pill p-urg'], Regular: ['P3', 'pill p-reg'] };
const EMPTY_HUB = { hub_name: '', zone: '', division: '', regional_lead: '', cluster_lead: '' };
const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };

// Admin & masters, demo layout (carrybee-complete-web.html pAdmin). Masters are read from the database and shown as they are.
// Add-hub form: five fields, no hub code, super admin only. Sync to the hub response sheet stays OFF until the sheet ID,
// tab name and header row are confirmed. Nothing is written from this form.
export default function Admin() {
  const [masters, setMasters] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('hubs');
  const [q, setQ] = useState('');
  const [newHub, setNewHub] = useState(EMPTY_HUB);
  const [loadedAt, setLoadedAt] = useState(null);

  async function load() {
    try {
      const r = await fetch('/api/masters', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMasters(j); setError(null); setLoadedAt(new Date().toISOString());
    } catch (e) { setError(String(e.message || e)); }
  }
  useEffect(() => { load(); }, []);

  const hubs = masters?.hubs || [];
  const cats = masters?.categories || [];
  const users = masters?.users || [];
  const config = masters?.config || [];
  const zones = useMemo(() => [...new Set(hubs.map((h) => h.zone).filter(Boolean))].sort(), [hubs]);
  const term = q.trim().toLowerCase();
  const hubRows = hubs.filter((h) => !term || `${h.hub_name} ${h.zone || ''} ${h.regional_lead || ''}`.toLowerCase().includes(term));
  const countOf = { hubs: hubs.length, cats: cats.length, users: users.length, sla: config.length };
  const setHubField = (k, v) => setNewHub((h) => ({ ...h, [k]: v }));
  const activeUsers = users.length;

  return (
    <div>
      <div className="ph">
        <div>
          <div className="kicker">Admin &amp; masters</div>
          <h1>Masters and access</h1>
          <p className="sub">Hubs, categories, users and SLA settings live in the database. Every change is written to the audit log.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="chip"><span className="live" aria-hidden="true" />Live · database</span>
          <button type="button" className="btn" onClick={load} aria-label="Refresh">Refresh</button>
        </div>
      </div>

      {error && <div className="box box-bad" role="alert" style={{ marginBottom: 12 }}><b>Could not load masters.</b> {error}</div>}

      <div className="kpis">
        <div className="kpi"><div className="lab"><svg className="ic" aria-hidden="true"><use href="#i-hub" /></svg>Hubs</div><div className="num">{fmtN(hubs.length)}</div><div className="delta muted">{fmtN(zones.length)} zones</div></div>
        <div className="kpi"><div className="lab"><svg className="ic" aria-hidden="true"><use href="#i-category" /></svg>Categories</div><div className="num">{fmtN(cats.length)}</div><div className="delta muted">from the category master</div></div>
        <div className="kpi"><div className="lab"><svg className="ic" aria-hidden="true"><use href="#i-team" /></svg>Active users</div><div className="num">{fmtN(activeUsers)}</div><div className="delta muted">CM · KAM · MX · admin</div></div>
        <div className="kpi"><div className="lab"><svg className="ic" aria-hidden="true"><use href="#i-zone" /></svg>Zones</div><div className="num">{fmtN(zones.length)}</div><div className="delta muted">{zones.join(' · ') || '—'}</div></div>
      </div>

      <div className="card mt">
        <div className="card-h">
          <div role="tablist" aria-label="Admin sections" className="seg" style={{ flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <span key={t.key} role="tab" tabIndex={0} aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''}
                onClick={() => { setTab(t.key); setQ(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(t.key); setQ(''); } }}>
                {t.label} · {fmtN(countOf[t.key])}
              </span>
            ))}
          </div>
        </div>

        {!masters && !error && <div className="empty">Loading masters…</div>}

        {masters && tab === 'hubs' && (
          <div className="admin-split">
            <div>
              <div className="search" style={{ maxWidth: 420, marginBottom: 12 }}>
                <input placeholder="Filter hubs by name, zone or regional lead…" aria-label="Filter hubs" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: 'inherit' }} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Hub name</th><th>Zone</th><th>Division</th><th>Regional lead</th><th>Status</th></tr></thead>
                  <tbody>
                    {hubRows.length === 0 && <tr><td colSpan={5}><div className="empty">No hubs match this filter.</div></td></tr>}
                    {hubRows.slice(0, 200).map((h) => (
                      <tr key={h.hub_name}>
                        <td><b>{h.hub_name}</b></td>
                        <td><span className="zc" style={{ borderColor: ZONE_COLOR[h.zone] || 'var(--line)' }}>{h.zone || '—'}</span></td>
                        <td>{h.division || '—'}</td>
                        <td>{h.regional_lead || '—'}</td>
                        <td><span className="pill p-ok">Active</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">Showing {fmtN(Math.min(200, hubRows.length))} of {fmtN(hubRows.length)} matching hubs. Hub changes are made in the database and shared with the zone sheets.</p>
            </div>

            <aside className="card admin-add" aria-label="Add hub">
              <div className="card-h" style={{ marginBottom: 4 }}><div><h2>Add hub</h2><small>Super admin only · syncs to the hub response sheet</small></div></div>
              <div className="stack" style={{ gap: 12, marginTop: 14 }}>
                <div className="field">
                  <label htmlFor="new-hub-name">Hub name *</label>
                  <div className="fctl"><input id="new-hub-name" value={newHub.hub_name} onChange={(e) => setHubField('hub_name', e.target.value)} placeholder="e.g. Chattogram Central" /></div>
                </div>
                <div className="field">
                  <label htmlFor="new-hub-zone">Zone *</label>
                  <div className="fctl">
                    <select id="new-hub-zone" value={newHub.zone} onChange={(e) => setHubField('zone', e.target.value)}>
                      <option value="">Select zone…</option>
                      {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="new-hub-division">Division</label>
                  <div className="fctl"><input id="new-hub-division" value={newHub.division} onChange={(e) => setHubField('division', e.target.value)} /></div>
                </div>
                <div className="field">
                  <label htmlFor="new-hub-regional">Regional lead</label>
                  <div className="fctl"><input id="new-hub-regional" value={newHub.regional_lead} onChange={(e) => setHubField('regional_lead', e.target.value)} /></div>
                </div>
                <div className="field">
                  <label htmlFor="new-hub-cluster">Cluster lead</label>
                  <div className="fctl"><input id="new-hub-cluster" value={newHub.cluster_lead} onChange={(e) => setHubField('cluster_lead', e.target.value)} /></div>
                </div>
                <div className="box box-warn" role="status">Sync is off. Nothing is written to the database or the hub response sheet until the sheet ID, tab name and header row are confirmed.</div>
                <button type="button" className="btn bee" disabled aria-disabled="true" style={{ justifyContent: 'center' }}>Save hub (sync off)</button>
              </div>
            </aside>
          </div>
        )}

        {masters && tab === 'cats' && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Issue category</th><th>Sub-category</th><th>Issue type</th><th>Side</th><th>Status</th></tr></thead>
              <tbody>
                {cats.length === 0 && <tr><td colSpan={5}><div className="empty">No categories.</div></td></tr>}
                {cats.map((c) => {
                  const [p, cls] = PRI_BY_TYPE[c.issue_type] || ['—', 'pill p-res'];
                  return (
                    <tr key={`${c.category}|${c.sub_category}`}>
                      <td>{c.category}</td>
                      <td>{c.sub_category}</td>
                      <td><span className={cls}>{c.issue_type ? `${p} · ${c.issue_type}` : '—'}</span></td>
                      <td className="mono">{c.side || '—'}</td>
                      <td><span className="pill p-ok">Active</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {masters && tab === 'users' && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Teams</th><th>Zone</th><th>Status</th></tr></thead>
              <tbody>
                {users.length === 0 && <tr><td colSpan={6}><div className="empty">No active users.</div></td></tr>}
                {users.map((u) => {
                  const ro = ['hub_ops', 'regional_lead'].includes(u.role);
                  return (
                    <tr key={u.email}>
                      <td><b>{u.display_name || u.email}</b></td>
                      <td className="mono">{u.email}</td>
                      <td className="mono">{u.role}</td>
                      <td>{(u.teams || []).join(', ') || '—'}</td>
                      <td>{u.zone || '—'}</td>
                      <td><span className={`pill ${ro ? 'p-wait' : 'p-ok'}`}>{ro ? 'Read-only' : 'Active'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {masters && tab === 'sla' && (
          <>
            <div className="grid g3">
              {config.length === 0 && <div className="empty">No settings found in app_config.</div>}
              {config.map((c) => (
                <div key={c.key} className="card">
                  <div className="kl">{c.key.replace(/_/g, ' ')}</div>
                  <div className="kv" style={{ fontSize: 20, wordBreak: 'break-word' }}>{typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value)}</div>
                  {c.description && <div className="ks">{c.description}</div>}
                </div>
              ))}
            </div>
            <p className="note">Rules in force: first comment within 2 hours of being raised (breach if none), pick within 4 hours, resolution within the category&apos;s SLA days for the issue&apos;s zone (category master, counted from the time raised; 72 hours when a category has no SLA). KAM follow-up at 2.5 hours from raising; CM first follow-up 2.5 hours after pick, then every 2 hours. Edit settings in the app_config table.</p>
            <p className="note">Zone change is an admin action from the issue drawer, and it is audited. The old sheet row is marked MOVED and a new row is appended with the same Issue ID.</p>
          </>
        )}
      </div>
      <p className="note2">Last loaded {loadedAt ? formatDhaka(loadedAt) : '—'} (Dhaka). Refresh to see the latest masters.</p>
    </div>
  );
}
