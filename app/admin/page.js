'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHead, LiveChip, Kpi, Zc, fmtN } from '../../components/demo';
import { formatDhaka } from '../../lib/time';

const TABS = [
  { key: 'hubs', label: 'Hub Master' },
  { key: 'cats', label: 'Category Master' },
  { key: 'users', label: 'Users & RBAC' },
  { key: 'sla', label: 'SLA & Policy' },
];
const PRI_BY_TYPE = { Critical: ['P1', 'p-crit'], Urgent: ['P2', 'p-urg'], Regular: ['P3', 'p-reg'] };
const EMPTY_HUB = { hub_name: '', zone: '', division: '', regional_lead: '', cluster_lead: '' };

// Central Ops / Admin (demo layout). Masters are read from the database and shown as they are.
// Add-hub form: five fields, no hub code. Sync to the hub response sheet is OFF until the sheet ID,
// tab name and header row are confirmed. Nothing is written from this form.
export default function Admin() {
  const [masters, setMasters] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('hubs');
  const [q, setQ] = useState('');
  const [newHub, setNewHub] = useState(EMPTY_HUB);

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
  const zones = useMemo(() => [...new Set(hubs.map((h) => h.zone).filter(Boolean))].sort(), [hubs]);
  const term = q.trim().toLowerCase();
  const hubRows = hubs.filter((h) => !term || `${h.hub_name} ${h.zone || ''} ${h.regional_lead || ''}`.toLowerCase().includes(term));
  const tabLabel = (t) => {
    const n = { hubs: hubs.length, cats: cats.length, users: users.length, sla: config.length }[t.key];
    return n == null ? t.label : `${t.label} (${fmtN(n)})`;
  };
  const setHubField = (k, v) => setNewHub((h) => ({ ...h, [k]: v }));
  const hubReady = newHub.hub_name.trim() && newHub.zone.trim();

  return (
    <div className="dm">
      <PageHead kicker="Admin & masters" title="Masters and access" sub="Hubs, categories, users and SLA settings live in the database. Every change is written to the audit log.">
        <LiveChip label="Live · database" />
        <button type="button" className="btn" onClick={load} aria-label="Refresh">⟳ Refresh</button>
      </PageHead>

      {error && <div className="box box-bad" role="alert"><b>Could not load masters.</b> {error}</div>}

      <div className="grid kpi-strip">
        <Kpi label="Hubs" value={fmtN(hubs.length)} sub={`${zones.length} zones`} icon="form" />
        <Kpi label="Categories" value={fmtN(cats.length)} sub="from the category master" icon="list" />
        <Kpi label="Active users" value={fmtN(users.length)} sub="CM · KAM · MX · admin" icon="users" />
        <Kpi label="Zones" value={fmtN(zones.length)} sub={zones.join(' · ') || '—'} icon="shield" />
      </div>

      <div className="card">
        <div className="admtabs" role="tablist" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => { setTab(t.key); setQ(''); }}>{tabLabel(t)}</button>
          ))}
        </div>

        {!masters && !error && <div className="empty">Loading masters…</div>}

        {masters && tab === 'hubs' && (
          <div className="admin-split">
            <div>
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
                        <td data-label="Hub"><b>{h.hub_name}</b></td>
                        <td data-label="Zone"><Zc z={h.zone} /></td>
                        <td data-label="Division">{h.division || '—'}</td>
                        <td data-label="Regional lead">{h.regional_lead || '—'}</td>
                        <td data-label="Status"><span className="pillc p-ok">Active</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="note">Showing {fmtN(Math.min(200, hubRows.length))} of {fmtN(hubRows.length)} matching hubs. Hub changes are made in the database and shared with the zone sheets.</div>
            </div>

            <aside className="card admin-add" aria-label="Add hub">
              <div className="kl"><span>Add hub</span></div>
              <p className="ks" style={{ marginTop: 6 }}>Super admin only. Saved to the database and synced to the hub response sheet.</p>
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
                <button type="button" className="btn y" disabled aria-disabled="true" style={{ justifyContent: 'center' }} title={hubReady ? 'Sync is off' : 'Fill in name and zone'}>Save hub (sync off)</button>
              </div>
            </aside>
          </div>
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
                      <td data-label="Category">{c.category}</td>
                      <td data-label="Sub-category">{c.sub_category}</td>
                      <td data-label="Issue type"><span className={`pillc ${cls}`}>{c.issue_type ? `${p} · ${c.issue_type}` : '—'}</span></td>
                      <td data-label="Side" className="mono">{c.side || '—'}</td>
                      <td data-label="Status"><span className="pillc p-ok">Active</span></td>
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
                    <td data-label="Name"><b>{u.display_name || u.email}</b></td>
                    <td data-label="Email" className="mono">{u.email}</td>
                    <td data-label="Role" className="mono">{u.role}</td>
                    <td data-label="Teams">{(u.teams || []).join(', ') || '—'}</td>
                    <td data-label="Zone">{u.zone || '—'}</td>
                    <td data-label="Status"><span className={`pillc ${['hub_ops', 'regional_lead'].includes(u.role) ? 'p-B' : 'p-ok'}`}>{['hub_ops', 'regional_lead'].includes(u.role) ? 'Read-only' : 'Active'}</span></td>
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
