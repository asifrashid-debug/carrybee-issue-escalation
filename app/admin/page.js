'use client';
import { useEffect, useMemo, useState } from 'react';
import { fmtN } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';

const TABS = [
  { key: 'hubs', label: 'Hub Master' },
  { key: 'cats', label: 'Category Master' },
  { key: 'users', label: 'Users & RBAC' },
  { key: 'sla', label: 'SLA & Policy' },
  { key: 'kam', label: 'KAM Funnel' },
];
const SHEET_LINK_DEFAULT = 'https://docs.google.com/spreadsheets/d/1YBOhdN5r6dPFfYg19ebSEsu0I0_cusZ-HrWVAgbm6UE/edit';
const CHANGE_FIELD_LABEL = { added: 'Added', kam_name: 'KAM', business_name: 'Name', is_active: 'Active' };
const PRI_BY_TYPE = { Critical: ['P1', 'pill p-crit'], Urgent: ['P2', 'pill p-urg'], Regular: ['P3', 'pill p-reg'] };
const EMPTY_HUB = { hub_name: '', zone: '', division: '', regional_lead: '', cluster_lead: '' };
const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };
const EMPTY_CAT = { category: '', sub_category: '', side: 'requester', issue_type: '', sla_isd: '', sla_osd: '', sla_ctg: '' };
const EMPTY_USER = { display_name: '', email: '', role: 'requester', teams: '', zone: '' };
const EMPTY_SETTING = { key: '', value: '', description: '' };
const SIDES = ['requester', 'ops'];
const ISSUE_TYPES = ['Critical', 'Urgent', 'Regular'];
const ROLES = ['requester', 'mx', 'team_lead', 'cm_lead', 'cm_member', 'hub_ops', 'regional_lead', 'management', 'admin'];
const ZONES_LIST = ['ISD', 'OSD', 'CTG'];

function Field({ id, label, required, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      <div className="fctl">{children}</div>
    </div>
  );
}

// Admin & masters, demo layout (carrybee-complete-web.html pAdmin). Masters are read from the database and shown as they are.
// Add-hub form: five fields, no hub code, super admin only. Sync to the hub response sheet stays OFF until the sheet ID,
// tab name and header row are confirmed. Nothing is written from this form.
// KAM funnel upload (super admin). Preview first; nothing is written until Apply.
// A Google Sheet link (tab "Unique Merchants") or a CSV. Merchants missing from the upload become CM and inactive.
function KamFunnelPanel() {
  const [source, setSource] = useState('sheet');
  const [link, setLink] = useState(SHEET_LINK_DEFAULT);
  const [tabName, setTabName] = useState('Unique Merchants');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);

  async function loadHistory() {
    try {
      const r = await fetch('/api/business/upload', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setHistory(j.uploads || []);
    } catch { /* history is optional */ }
  }
  useEffect(() => { loadHistory(); }, []);

  function changeSource(s) { setSource(s); setPreview(null); setConfirmLarge(false); setMsg(null); }

  function buildForm(mode) {
    const f = new FormData();
    f.set('mode', mode);
    f.set('source', source);
    if (source === 'csv') f.set('file', file);
    else { f.set('sheet', link); f.set('tab', tabName); }
    if (mode === 'apply' && confirmLarge) f.set('confirm_large', 'true');
    return f;
  }

  async function run(mode) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/business/upload', { method: 'POST', body: buildForm(mode) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (mode === 'preview') { setPreview(j); setConfirmLarge(false); return; }
      if (j.mode !== 'apply') { setPreview(j); throw new Error(j.blocked || 'The upload was not applied.'); }
      setPreview(null);
      setMsg({ kind: 'ok', text: `Applied. ${fmtN(j.summary.usable)} merchants in the list, ${fmtN(j.summary.added)} added, ${fmtN(j.summary.kamChanged)} KAM changes, ${fmtN(j.summary.deactivated)} set to CM and inactive.` });
      loadHistory();
    } catch (e) {
      setMsg({ kind: 'bad', text: String(e.message || e) });
    } finally { setBusy(false); }
  }

  const s = preview?.summary;
  const canPreview = source === 'csv' ? !!file : !!link.trim();
  const applyBlocked = !preview || (preview.blocked && !(preview.can_override && confirmLarge));

  return (
    <div className="stack" style={{ gap: 14, padding: 16 }}>
      <div className="card-h" style={{ marginBottom: 0 }}><div><h2>KAM funnel</h2><small>Super admin only · sets each merchant&apos;s KAM for the MX form</small></div></div>
      <p className="note" style={{ margin: 0 }}>Merchants in the upload get their KAM. Merchants missing from the upload are set to CM and made inactive. Preview first; nothing is written until you apply.</p>

      <div role="tablist" aria-label="Upload source" className="seg" style={{ alignSelf: 'flex-start' }}>
        <span role="tab" tabIndex={0} aria-selected={source === 'sheet'} className={source === 'sheet' ? 'on' : ''} onClick={() => changeSource('sheet')}>Google Sheet link</span>
        <span role="tab" tabIndex={0} aria-selected={source === 'csv'} className={source === 'csv' ? 'on' : ''} onClick={() => changeSource('csv')}>CSV file</span>
      </div>

      {source === 'sheet' ? (
        <div className="grid g2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="kam-link">Sheet link or ID *</label><div className="fctl"><input id="kam-link" value={link} onChange={(e) => { setLink(e.target.value); setPreview(null); }} /></div></div>
          <div className="field"><label htmlFor="kam-tab">Tab name</label><div className="fctl"><input id="kam-tab" value={tabName} onChange={(e) => { setTabName(e.target.value); setPreview(null); }} /></div></div>
        </div>
      ) : (
        <div className="field"><label htmlFor="kam-file">CSV file *</label><div className="fctl"><input id="kam-file" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} /></div></div>
      )}
      <p className="note" style={{ margin: 0 }}>Columns: <b>business id</b>, <b>business name</b>, <b>KAM name</b> (or <b>ID</b>, <b>Merchant Name</b>, <b>KAM</b>). Blank KAM becomes CM.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy || !canPreview} onClick={() => run('preview')}>{busy ? 'Working…' : 'Preview'}</button>
        <button type="button" className="btn bee" disabled={busy || applyBlocked} onClick={() => run('apply')}>Apply to database</button>
      </div>

      {msg && <div className={`box ${msg.kind === 'ok' ? 'box-ok' : 'box-bad'}`} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</div>}

      {preview && s && (
        <div className="stack" style={{ gap: 10 }}>
          {preview.blocked && <div className="box box-warn" role="alert">{preview.blocked}</div>}
          {preview.can_override && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={confirmLarge} onChange={(e) => setConfirmLarge(e.target.checked)} />
              <span>Yes, set {fmtN(s.deactivated)} merchants to CM and inactive.</span>
            </label>
          )}
          <div className="grid g3" style={{ gap: 10 }}>
            <div className="kpi"><div className="lab">Rows in file</div><div className="num">{fmtN(s.rowsInFile)}</div></div>
            <div className="kpi"><div className="lab">Usable merchants</div><div className="num">{fmtN(s.usable)}</div><div className="delta muted">{fmtN(s.duplicateIds)} duplicate IDs skipped</div></div>
            <div className="kpi"><div className="lab">No KAM (→ CM)</div><div className="num">{fmtN(s.noKam)}</div></div>
            <div className="kpi"><div className="lab">Added</div><div className="num">{fmtN(s.added)}</div></div>
            <div className="kpi"><div className="lab">KAM changed</div><div className="num">{fmtN(s.kamChanged)}</div></div>
            <div className="kpi"><div className="lab">Set to CM and inactive</div><div className="num">{fmtN(s.deactivated)}</div></div>
          </div>
          {preview.total_changes > 0 && (
            <div>
              <p className="note" style={{ margin: '0 0 6px' }}>First {fmtN(preview.sample.length)} of {fmtN(preview.total_changes)} changes:</p>
              <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Business ID</th><th>Change</th><th>Was</th><th>Now</th></tr></thead>
                  <tbody>{preview.sample.map((c, i) => (
                    <tr key={`${c.business_id}-${c.field_name}-${i}`}><td>{c.business_id}</td><td>{CHANGE_FIELD_LABEL[c.field_name] || c.field_name}</td><td>{c.old_value ?? '—'}</td><td>{c.new_value ?? '—'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="note" style={{ margin: '0 0 6px' }}>Recent uploads</p>
        {history.length === 0 ? <div className="empty">No uploads yet.</div> : (
          <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>When (Dhaka)</th><th>By</th><th>Source</th><th>Status</th><th>Merchants</th><th>Added</th><th>To CM</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDhaka(h.created_at)}</td><td>{h.uploaded_by}</td><td>{h.source === 'sheet' ? 'Sheet' : 'CSV'}</td>
                  <td>{h.status}{h.error ? ` · ${h.error}` : ''}</td><td>{fmtN(h.usable)}</td><td>{fmtN(h.added)}</td><td>{fmtN(h.deactivated)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const [masters, setMasters] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('hubs');
  const [q, setQ] = useState('');
  const [newHub, setNewHub] = useState(EMPTY_HUB);
  const [addFor, setAddFor] = useState(null); // 'cats' | 'users' | 'sla' | null: which tab's add form is open
  const [newCat, setNewCat] = useState(EMPTY_CAT);
  const [newUser, setNewUser] = useState(EMPTY_USER);
  const [newSetting, setNewSetting] = useState(EMPTY_SETTING);
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
                onClick={() => { setTab(t.key); setQ(''); setAddFor(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(t.key); setQ(''); setAddFor(null); } }}>
                {t.label}{countOf[t.key] !== undefined ? ` · ${fmtN(countOf[t.key])}` : ''}
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
          <div className={addFor === 'cats' ? 'admin-split' : undefined}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="muted small">{fmtN(cats.length)} categories</span>
                <button type="button" className="btn bee" aria-expanded={addFor === 'cats'} onClick={() => setAddFor(addFor === 'cats' ? null : 'cats')}>{addFor === 'cats' ? 'Close form' : '+ Add category'}</button>
              </div>
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
            </div>
            {addFor === 'cats' && (
              <aside className="card admin-add" aria-label="Add category">
                <div className="card-h" style={{ marginBottom: 4 }}><div><h2>Add category</h2><small>Super admin only · saving not connected yet</small></div></div>
                <div className="stack" style={{ gap: 12, marginTop: 14 }}>
                  <Field id="new-cat-category" label="Issue category" required><input id="new-cat-category" value={newCat.category} onChange={(e) => setNewCat({ ...newCat, category: e.target.value })} placeholder="e.g. Pickup Issue" /></Field>
                  <Field id="new-cat-sub" label="Sub-category" required><input id="new-cat-sub" value={newCat.sub_category} onChange={(e) => setNewCat({ ...newCat, sub_category: e.target.value })} /></Field>
                  <Field id="new-cat-side" label="Side" required>
                    <select id="new-cat-side" value={newCat.side} onChange={(e) => setNewCat({ ...newCat, side: e.target.value })}>
                      {SIDES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field id="new-cat-type" label="Issue type">
                    <select id="new-cat-type" value={newCat.issue_type} onChange={(e) => setNewCat({ ...newCat, issue_type: e.target.value })}>
                      <option value="">None</option>
                      {ISSUE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                  {['sla_isd', 'sla_osd', 'sla_ctg'].map((k, i) => (
                    <Field key={k} id={`new-cat-${k}`} label={`SLA days · ${ZONES_LIST[i]}`}>
                      <input id={`new-cat-${k}`} type="number" min="1" value={newCat[k]} onChange={(e) => setNewCat({ ...newCat, [k]: e.target.value })} />
                    </Field>
                  ))}
                  <div className="box box-warn" role="status">Saving is not connected yet. Nothing is written to the category master from this form.</div>
                  <button type="button" className="btn bee" disabled aria-disabled="true" style={{ justifyContent: 'center' }}>Save category (not connected)</button>
                </div>
              </aside>
            )}
          </div>
        )}

        {masters && tab === 'users' && (
          <div className={addFor === 'users' ? 'admin-split' : undefined}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="muted small">{fmtN(users.length)} active users</span>
                <button type="button" className="btn bee" aria-expanded={addFor === 'users'} onClick={() => setAddFor(addFor === 'users' ? null : 'users')}>{addFor === 'users' ? 'Close form' : '+ Add user'}</button>
              </div>
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
            </div>
            {addFor === 'users' && (
              <aside className="card admin-add" aria-label="Add user">
                <div className="card-h" style={{ marginBottom: 4 }}><div><h2>Add user</h2><small>Super admin only · saving not connected yet</small></div></div>
                <div className="stack" style={{ gap: 12, marginTop: 14 }}>
                  <Field id="new-user-name" label="Name" required><input id="new-user-name" value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} placeholder="e.g. Md. Rahim Uddin" /></Field>
                  <Field id="new-user-email" label="Email" required><input id="new-user-email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="name@carrybee.com" /></Field>
                  <Field id="new-user-role" label="Role" required>
                    <select id="new-user-role" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                      {ROLES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field id="new-user-teams" label="Teams (comma separated)"><input id="new-user-teams" value={newUser.teams} onChange={(e) => setNewUser({ ...newUser, teams: e.target.value })} placeholder="e.g. KAM, CM" /></Field>
                  <Field id="new-user-zone" label="Zone"><select id="new-user-zone" value={newUser.zone} onChange={(e) => setNewUser({ ...newUser, zone: e.target.value })}><option value="">None</option>{ZONES_LIST.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
                  <div className="box box-warn" role="status">Saving is not connected yet. Nothing is written to users or access rules from this form.</div>
                  <button type="button" className="btn bee" disabled aria-disabled="true" style={{ justifyContent: 'center' }}>Save user (not connected)</button>
                </div>
              </aside>
            )}
          </div>
        )}

        {masters && tab === 'sla' && (
          <>
            <div className={addFor === 'sla' ? 'admin-split' : undefined}>
              <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="muted small">{fmtN(config.length)} settings</span>
                <button type="button" className="btn bee" aria-expanded={addFor === 'sla'} onClick={() => setAddFor(addFor === 'sla' ? null : 'sla')}>{addFor === 'sla' ? 'Close form' : '+ Add setting'}</button>
              </div>
                {config.length === 0 && <div className="empty">No settings found in app_config.</div>}
                <div className={addFor === 'sla' ? 'stack' : 'grid g3'} style={addFor === 'sla' ? { gap: 12 } : undefined}>
                  {config.map((c) => (
                    <div key={c.key} className="card">
                      <div className="kl">{c.key.replace(/_/g, ' ')}</div>
                      <div className="kv" style={{ fontSize: 20, wordBreak: 'break-word' }}>{typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value)}</div>
                      {c.description && <div className="ks">{c.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
              {addFor === 'sla' && (
                <aside className="card admin-add" aria-label="Add setting">
                  <div className="card-h" style={{ marginBottom: 4 }}><div><h2>Add setting</h2><small>Super admin only · saving not connected yet</small></div></div>
                  <div className="stack" style={{ gap: 12, marginTop: 14 }}>
                    <Field id="new-set-key" label="Setting key" required><input id="new-set-key" value={newSetting.key} onChange={(e) => setNewSetting({ ...newSetting, key: e.target.value })} placeholder="e.g. pick_hours" /></Field>
                    <Field id="new-set-value" label="Value (text or JSON)" required><input id="new-set-value" value={newSetting.value} onChange={(e) => setNewSetting({ ...newSetting, value: e.target.value })} placeholder='e.g. 4 or {"hours": 4}' /></Field>
                    <Field id="new-set-desc" label="Description"><input id="new-set-desc" value={newSetting.description} onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })} /></Field>
                    <div className="box box-warn" role="status">Saving is not connected yet. Nothing is written to app settings from this form.</div>
                    <button type="button" className="btn bee" disabled aria-disabled="true" style={{ justifyContent: 'center' }}>Save setting (not connected)</button>
                  </div>
                </aside>
              )}
            </div>
            <p className="note">Rules in force: first comment within 2 hours of being raised (breach if none), pick within 4 hours, resolution within the category&apos;s SLA days for the issue&apos;s zone (category master, counted from the time raised; 72 hours when a category has no SLA). KAM follow-up at 2.5 hours from raising; CM first follow-up 2.5 hours after pick, then every 2 hours. Edit settings in the app_config table.</p>
            <p className="note">Zone change is an admin action from the issue drawer, and it is audited. The old sheet row is marked MOVED and a new row is appended with the same Issue ID.</p>
          </>
        )}

        {tab === 'kam' && <KamFunnelPanel />}
      </div>
      <p className="note2">Last loaded {loadedAt ? formatDhaka(loadedAt) : '—'} (Dhaka). Refresh to see the latest masters.</p>
    </div>
  );
}
