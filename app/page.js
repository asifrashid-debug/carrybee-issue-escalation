'use client';
import { useCallback, useEffect, useState } from 'react';
import IssueDrawer from '../components/IssueDrawer';
import CopyButton from '../components/CopyButton';
import { useAnalytics } from '../components/useAnalytics';
import { fmtN } from '../components/demo';
import { TrkIcon } from '../components/trk-icons';
import './trk-demo.css';
const BRAND = { bee: '#FFCC00', mint: '#00E5A0', flare: '#FF5470', azure: '#37A9FF', violet: '#A78BFA' };
const ZONE_COLOR = { ISD: BRAND.bee, OSD: BRAND.azure, CTG: BRAND.violet };
const PRI_COLOR = { P1: BRAND.flare, P2: BRAND.bee, P3: BRAND.mint, P4: '#A3A1A8' };
const PRI_PILL = { P1: 'p-urg', P2: 'p-crit', P3: 'p-reg', P4: 'p-res' };

// Donut as in the demo's pie(): plain filled slices, no hole. Inputs are numbers and palette colours only.
function pieSvg(segments, size = 120) {
  const S = size, cx = S / 2, cy = S / 2, R = S / 2 - 3;
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  let a = -Math.PI / 2, out = '';
  segments.forEach((seg) => {
    const ang = (2 * Math.PI * seg.value) / total;
    if (ang <= 0) return;
    if (ang >= 2 * Math.PI - 1e-6) { out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${seg.color}"/>`; return; }
    const a2 = a + ang, large = ang > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a), x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
    out += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${seg.color}"/>`;
    a = a2;
  });
  return `<svg class="pie" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Open issues by priority">${out}</svg>`;
}
import { formatDhaka, hoursSince } from '../lib/time';

const PAGE = 20;
const ZONES = ['ISD', 'OSD', 'CTG'];
const LIST_VIEWS = ['mine', 'unpicked', 'awaiting', 'resolved_week'];
const OPS_STATUSES = ['New', 'Picked', 'In Progress', 'On Hold', 'Resolved', 'Unresolved'];
const COLUMNS = [
  { key: 'pick', title: 'Needs pick', params: { view: 'unpicked' }, listView: 'unpicked' },
  { key: 'await', title: 'Awaiting first comment', params: { view: 'awaiting' }, listView: 'awaiting' },
  { key: 'prog', title: 'In progress', params: { ops_issue_status: 'In Progress' }, listView: 'all' },
  { key: 'done', title: 'Resolved this week', params: { view: 'resolved_week' }, listView: 'resolved_week' },
];
// Optional columns are switched on from the Columns panel. The nine base columns always show.
const OPTIONAL = [
  { key: 'prio', label: 'Priority' },
  { key: 'ops', label: 'Ops Status' },
  { key: 'raiser', label: 'Raised by' },
];

// Owner avatar: initials only, never the full name.
function initials(n) {
  const p = String(n || '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return p.map((x) => x[0].toUpperCase()).join('') || '?';
}

// Hours as "3d 2h" for longer spans, "5h" for short ones.
function spanText(h) {
  const x = Math.max(0, Math.round(h));
  return x >= 24 ? `${Math.floor(x / 24)}d ${x % 24}h` : `${x}h`;
}

// SLA state per row. Breach rules: no first comment more than 2h after being raised;
// unpicked past 4h; open past the category resolution SLA (days per zone, from the API).
function sla(e) {
  const age = hoursSince(e.submitted_at);
  if (e.ops_issue_status === 'Resolved') return { state: 'ok', text: 'Resolved' };
  if (!e.issue_response_datetime && age > 2) return { state: 'br', text: `No comment · ${fmtN(Math.round(age - 2))}h over` };
  if (!e.issue_pick_time && age > 4) return { state: 'br', text: `Unpicked · ${Math.round(age)}h` };
  if (!e.issue_response_datetime) return { state: 'risk', text: `${Math.max(0, 2 - age).toFixed(1)}h to limit` };
  const limitH = (e.resolution_days || 3) * 24;
  if (e.resolution_breach) return { state: 'br', text: `Resolution overdue · ${spanText(age - limitH)}` };
  const left = limitH - age;
  return { state: left < limitH * 0.2 ? 'risk' : 'ok', text: `Resolve in ${spanText(left)} · ${e.resolution_days || 3}d SLA` };
}

// CM pick SLA line (only CM-assigned MX issues). Deadline is pick_due_at from the API.
function pickLine(e) {
  if (!e.cm_assigned) return null;
  if (e.issue_pick_time) {
    return e.pick_missed ? { cls: 'sla-bad', text: 'Picked late · justification' } : { cls: 'sla-ok', text: 'Picked on time' };
  }
  const left = (new Date(e.pick_due_at).getTime() - Date.now()) / 60e3;
  if (left > 0) return { cls: 'sla-warn', text: `Pick due in ${Math.ceil(left)} min` };
  if (e.pick_phase === 'escalated') return { cls: 'sla-bad', text: 'Pick failure · CM Lead' };
  return { cls: 'sla-bad', text: `Pick overdue · ${Math.round(-left)} min` };
}

// KAM feedback line per row (phase comes from the API).

// Query string for /api/escalations. Filters and view come from state; extra overrides (page, board columns).
function buildQuery(f, extra = {}) {
  const p = new URLSearchParams();
  if (f.zone) p.set('zone', f.zone);
  const listView = LIST_VIEWS.includes(f.view) ? f.view : '';
  const base = {
    view: listView,
    search: f.search,
    priority_scale: f.prio,
    channel: f.channel,
    issue_status: f.istat,
    ops_issue_status: f.ostat,
    feedback: f.view === 'failures' ? 'failure' : '',
    pick: f.view === 'pick_failures' ? 'failure' : '',
    page: f.page,
    pageSize: PAGE,
  };
  Object.entries({ ...base, ...extra }).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
  return p.toString();
}

// Export helpers. Excel is written as SpreadsheetML (.xml), which Excel opens directly.
function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const EXPORT_HEAD = ['Issue ID', 'Timestamp (Dhaka)', 'Channel', 'Zone', 'Concern Hub', 'Consignment ID', 'Merchant', 'Category', 'Issue Status', 'Ops Status', 'Priority', 'Raised by', 'Age (h)', 'SLA'];
function exportRow(e) {
  return [e.issue_id, formatDhaka(e.submitted_at), e.channel || '', e.zone || '', e.concern_hub || '', e.consignment_id || '', e.merchant_name || '', e.issue_category || '', e.issue_status || '', e.ops_issue_status || '', e.priority_scale || '', e.email || '', hoursSince(e.submitted_at).toFixed(1), sla(e).text];
}
function toCsv(rows) {
  return [EXPORT_HEAD, ...rows.map(exportRow)].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
function toSpreadsheetML(rows) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const cell = (v) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const body = [EXPORT_HEAD, ...rows.map(exportRow)].map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('');
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Escalations"><Table>${body}</Table></Worksheet></Workbook>`;
}

// First hub layer response on the issue, shortened for the list (full text in the cell tooltip).

function fbText(e) {
  if (e.feedback_phase === 'escalated') return { cls: 'sla-bad', text: 'Feedback failure · Team Lead' };
  if (e.feedback_phase === 'justification_due') return { cls: 'sla-bad', text: 'Feedback overdue · justification due' };
  if (e.feedback_phase === 'pending') {
    const left = Math.max(0, (new Date(e.feedback_due_at).getTime() - Date.now()) / 3600e3);
    return { cls: 'sla-warn', text: `Feedback due in ${left.toFixed(1)}h` };
  }
  return { cls: 'sla-ok', text: `Feedback: ${e.kam_feedback_status}` };
}

function hubText(e) {
  const t = [e.layer1_response, e.layer2_response, e.layer3_response].map((v) => String(v || '').trim()).find(Boolean) || '';
  return t.length > 90 ? `${t.slice(0, 87)}...` : t;
}

export default function Tracker() {
  const analytics = useAnalytics();
  const { data: stats } = analytics;
  const [me, setMe] = useState(null);
  const [view, setView] = useState('all');
  const [zone, setZone] = useState('');
  const [search, setSearch] = useState('');
  const [prio, setPrio] = useState('');
  const [channel, setChannel] = useState('');
  const [istat, setIstat] = useState('');
  const [ostat, setOstat] = useState('');
  const [panel, setPanel] = useState(null); // null | 'filters' | 'columns'
  const [extraCols, setExtraCols] = useState({});
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState(null);
  const [list, setList] = useState({ rows: [], count: 0 });
  const [resolvedWeek, setResolvedWeek] = useState(null);
  const [viewCounts, setViewCounts] = useState({});
  const [exportOpen, setExportOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);

  const user = me || { email: '', role: '—' };
  const canSeeFailures = ['team_lead', 'cm_lead', 'admin', 'management'].includes(user.role);
  const canSeePickFailures = ['cm_lead', 'admin', 'management'].includes(user.role);
  const isLead = user.role === 'team_lead'; // bulk KAM feedback is for team leads only
  const filterCount = [prio, channel, istat, ostat].filter(Boolean).length;

  const load = useCallback(async () => {
    setLoading(true);
    const f = { zone, view, search, prio, channel, istat, ostat, page };
    try {
      if (view === 'board') {
        const res = await Promise.all(COLUMNS.map((c) =>
          fetch(`/api/escalations?${buildQuery({ zone }, { ...c.params, pageSize: 6 })}`, { cache: 'no-store' }).then((r) => r.json())));
        const failed = res.find((r) => r.error);
        if (failed) throw new Error(failed.error);
        const b = {};
        COLUMNS.forEach((c, i) => { b[c.key] = { count: res[i].count || 0, rows: res[i].data || [] }; });
        setBoard(b);
        setResolvedWeek(b.done?.count ?? null);
      } else {
        const j = await fetch(`/api/escalations?${buildQuery(f)}`, { cache: 'no-store' }).then((r) => r.json());
        if (j.error) throw new Error(j.error);
        setList({ rows: j.data || [], count: j.count || 0 });
        // Resolved-this-week count for the KPI card comes back with the list (same scope), one request not two
        if (j.resolved_week != null) setResolvedWeek(j.resolved_week);
      }
      setError(null);
      setUpdated(new Date());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [zone, view, search, prio, channel, istat, ostat, page]);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    const o = new URLSearchParams(window.location.search).get('open');
    if (o) setOpenId(o);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  // Counts for the My and Feedback failures chips: count-only requests (pageSize 1), same 30s refresh.
  const loadCounts = useCallback(async () => {
    const want = ['mine', ...(canSeeFailures ? ['failures'] : [])];
    const out = {};
    await Promise.all(want.map(async (v) => {
      try {
        const j = await fetch(`/api/escalations?${buildQuery({ view: v }, { pageSize: 1 })}`, { cache: 'no-store' }).then((r) => r.json());
        if (!j.error) out[v] = j.count || 0;
      } catch { /* chip stays hidden */ }
    }));
    setViewCounts((c) => ({ ...c, ...out }));
  }, [canSeeFailures]);
  useEffect(() => { loadCounts(); const t = setInterval(loadCounts, 30000); return () => clearInterval(t); }, [loadCounts]);
  useEffect(() => { setPage(1); }, [search, prio, channel, istat, ostat, zone, view]);
  useEffect(() => { setSelected(new Set()); }, [zone, view, page, search, prio, channel, istat, ostat]);

  // Views bar: zone chips set the zone; the other views set the view. Zone and view stay in step.
  const views = [
    { key: 'all', label: 'All Escalations' },
    { key: 'mine', label: 'My Escalations' },
    { key: 'unpicked', label: 'Unpicked Queue' },
    { key: 'awaiting', label: 'Awaiting 1st Response' },
    { key: 'resolved_week', label: 'Resolved This Week' },
    ...ZONES.map((z) => ({ key: z, label: `${z} Zone` })),
    { key: 'board', label: 'Board' },
    ...(canSeePickFailures ? [{ key: 'pick_failures', label: 'Pick Failures' }] : []),
    ...(canSeeFailures ? [{ key: 'failures', label: 'Feedback Failures' }] : []),
  ];
  const activeKey = ZONES.includes(zone) ? zone : view;
  function chooseView(key) {
    if (ZONES.includes(key)) { setZone(key); setView('all'); return; }
    setZone(''); setView(key);
  }

  // Export the same rows the list shows (all pages, capped at 1,000).
  async function exportRows() {
    const out = [];
    for (let p = 1; p <= 10; p++) {
      const j = await fetch(`/api/escalations?${buildQuery({ zone, view, search, prio, channel, istat, ostat, page: p }, { pageSize: 100 })}`, { cache: 'no-store' }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      out.push(...(j.data || []));
      if ((j.data || []).length < 100) break;
    }
    return out;
  }
  async function doExport(kind) {
    setExporting(true);
    try {
      const rows = await exportRows();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === 'csv') download(`escalations-${stamp}.csv`, toCsv(rows), 'text/csv');
      else download(`escalations-${stamp}.xml`, toSpreadsheetML(rows), 'application/vnd.ms-excel');
      if (rows.length >= 1000) setError('Export stopped at 1,000 rows. Narrow the filters to get the rest.');
    } catch (e) {
      setError(`Export failed: ${e.message || e}`);
    } finally {
      setExporting(false);
    }
  }

  const pageIds = list.rows.map((r) => r.issue_id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleSel(id) {
    setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function togglePage() {
    setSelected((cur) => { const n = new Set(cur); pageIds.forEach((id) => { if (pageAllSelected) n.delete(id); else n.add(id); }); return n; });
  }
  // Team lead: set KAM feedback on the selected issues (server checks team scope and skips any already set).
  async function bulkFeedback(outcome) {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const r = await fetch('/api/escalations/bulk-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_ids: ids, outcome }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Bulk update failed');
      const parts = [`${j.updated.length} set to ${outcome}`];
      if (j.skipped.length) parts.push(`${j.skipped.length} skipped`);
      if (j.failed.length) parts.push(`${j.failed.length} failed`);
      setBulkMsg(`${parts.join(' · ')}.`);
      setSelected(new Set());
      load();
    } catch (e) {
      setBulkMsg(`Could not update: ${e.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  }

  const k = stats?.kpi;
  const zoneOpen = stats ? stats.zones.map((z) => `${z.zone}: ${fmtN(z.open)}`).join(' · ') : '';
  const lastSynced = updated ? formatDhaka(updated.toISOString()) : '—';
  const visibleExtra = OPTIONAL.filter((c) => extraCols[c.key]);
  const showList = ['all', 'mine', 'unpicked', 'awaiting', 'resolved_week', 'failures', 'pick_failures'].includes(view);
  const total = k?.total || 0;
  const stages = k ? [
    { label: 'Picked', value: k.picked },
    { label: '1st comment', value: k.responded },
    { label: 'Resolved', value: k.resolved },
  ] : [];
  const zoneTotal = (z) => stats?.zones?.find((r) => r.zone === z)?.total;
  const zoneBars = (stats?.zones || []).map((z) => ({ label: z.zone, value: z.open, color: ZONE_COLOR[z.zone] }));
  const zoneBarTotal = zoneBars.reduce((a, b) => a + b.value, 0) || 1;
  const priRows = (stats?.priorities || []).map((p) => ({ label: p.label, open: p.open, color: PRI_COLOR[p.label] }));
  const chipDefs = [
    { key: 'all', label: 'All escalations', n: k?.total },
    { key: 'mine', label: 'My escalations', n: viewCounts.mine },
    { key: 'unpicked', label: 'Unpicked queue', n: k?.unpicked },
    { key: 'awaiting', label: 'Awaiting 1st response', n: k?.awaitingResponse },
    { key: 'resolved_week', label: 'Resolved this week', n: resolvedWeek },
    { key: 'ISD', label: 'ISD zone', n: zoneTotal('ISD') },
    { key: 'OSD', label: 'OSD zone', n: zoneTotal('OSD') },
    ...(canSeeFailures ? [{ key: 'failures', label: 'Feedback failures', n: viewCounts.failures }] : []),
  ].filter((c) => typeof c.n === 'number');
  const moreOpts = [
    { key: 'CTG', label: 'CTG zone' },
    ...(canSeePickFailures ? [{ key: 'pick_failures', label: 'Pick failures' }] : []),
    { key: 'board', label: 'Board view' },
  ];
  const moreOn = moreOpts.some((o) => o.key === activeKey) ? activeKey : '';
  const pages = Math.max(1, Math.ceil(list.count / PAGE));

  return (
    <div className="dm">
      <div className="trk-demo">
        <div className="ph">
          <div>
            <div className="kicker">Tracker · live feed · synced {lastSynced}</div>
            <h1>Needs attention</h1>
            <p className="sub">Triage first. The queue is the main column and charts give context beside it.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="search">
              <TrkIcon name="category" />
              <input type="search" placeholder="Search issue ID, consignment or merchant" aria-label="Search issues" value={search} onChange={(e) => setSearch(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: 'inherit' }} />
            </label>
            <button type="button" className="btn" aria-expanded={panel === 'filters'} onClick={() => setPanel(panel === 'filters' ? null : 'filters')}>
              Filters{filterCount ? ` (${filterCount})` : ''}
            </button>
            <button type="button" className="btn" aria-expanded={panel === 'columns'} onClick={() => setPanel(panel === 'columns' ? null : 'columns')}>
              Columns ({9 + visibleExtra.length}/{9 + OPTIONAL.length})
            </button>
            <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn primary" aria-haspopup="menu" aria-expanded={exportOpen} disabled={exporting} onClick={() => setExportOpen((o) => !o)}>{exporting ? 'Exporting…' : 'Export'}</button>
              {exportOpen && (
                <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, minWidth: 170, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.12)', display: 'grid', gap: 2 }}>
                  <button type="button" role="menuitem" className="btn" style={{ justifyContent: 'flex-start', border: 0, background: 'transparent' }} onClick={() => { setExportOpen(false); doExport('csv'); }}>CSV</button>
                  <button type="button" role="menuitem" className="btn" style={{ justifyContent: 'flex-start', border: 0, background: 'transparent' }} onClick={() => { setExportOpen(false); doExport('xls'); }}>Excel (XML)</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="kpis" style={{ marginTop: 16 }}>
          <div className="kpi"><div className="lab"><TrkIcon name="escalation" />Open escalations</div><div className="num">{fmtN(k?.open)}</div><div className="delta muted">{stats ? zoneOpen : '…'}</div></div>
          <div className="kpi"><div className="lab"><TrkIcon name="pick" />Unpicked queue</div><div className="num">{fmtN(k?.unpicked)}</div><div className="delta muted">waiting for hub pick</div></div>
          <div className="kpi"><div className="lab"><TrkIcon name="sla" />Awaiting first response</div><div className="num">{fmtN(k?.awaitingResponse)}</div><div className="delta muted">open, no comment yet</div></div>
          <div className="kpi"><div className="lab"><TrkIcon name="breach" />Past SLA</div><div className="num">{fmtN(k?.breaches)}</div><div className="delta muted">breaches in scope</div></div>
        </div>

        <div style={{ margin: '16px 0' }}>
          <div className="chips" role="group" aria-label="Tracker views">
            {chipDefs.map((c) => (
              <button key={c.key} type="button" className={`chip ${activeKey === c.key ? 'on' : ''}`} aria-pressed={activeKey === c.key} onClick={() => chooseView(c.key)}>
                {c.label} <b>{fmtN(c.n)}</b>
              </button>
            ))}
            <select className="chip" aria-label="More views" value={moreOn} onChange={(e) => { if (e.target.value) chooseView(e.target.value); }} style={{ paddingRight: 12 }}>
              <option value="">More views</option>
              {moreOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="box box-bad" role="alert" style={{ marginBottom: 16 }}>Could not load issues: {error}</div>}

        {panel && (
          <div className="card" style={{ marginBottom: 16 }}>
        {panel === 'filters' && (
          <div className="grid g4" style={{ marginTop: 12, marginBottom: 0 }} role="group" aria-label="Filters">
            <div><label className="flabel">Priority</label><div className="fctl"><select value={prio} onChange={(e) => setPrio(e.target.value)}><option value="">All priorities</option><option value="P1">P1 · Critical</option><option value="P2">P2 · Urgent</option><option value="P3">P3 · Regular</option><option value="P4">P4</option></select></div></div>
            <div><label className="flabel">Channel</label><div className="fctl"><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All channels</option><option value="KAM">KAM</option><option value="MX">MX</option></select></div></div>
            <div><label className="flabel">Issue status</label><div className="fctl"><select value={istat} onChange={(e) => setIstat(e.target.value)}><option value="">Any</option><option>Open</option><option>Reopened</option><option>Resolved</option><option>Closed</option></select></div></div>
            <div><label className="flabel">Ops status</label><div className="fctl"><select value={ostat} onChange={(e) => setOstat(e.target.value)}><option value="">Any</option>{OPS_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div></div>
            <div style={{ gridColumn: '1 / -1' }}><button type="button" className="btn sm" onClick={() => { setPrio(''); setChannel(''); setIstat(''); setOstat(''); }}>Clear filters</button></div>
          </div>
        )}
        {panel === 'columns' && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontSize: 13 }} role="group" aria-label="Optional columns">
            <span style={{ color: 'var(--mut)' }}>Always shown: Issue ID, Aging &amp; SLA, Timestamp, Consignment / Merchant, Channel, Zone, Concern Hub, Issue Status, Category.</span>
            {OPTIONAL.map((c) => (
              <label key={c.key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!extraCols[c.key]} onChange={(e) => setExtraCols({ ...extraCols, [c.key]: e.target.checked })} />
                {c.label}
              </label>
            ))}
          </div>
        )}
          </div>
        )}

        {view === 'board' ? (
          <div style={{ marginTop: 4 }}>
      {view === 'board' && (
        <div className="board">
          {COLUMNS.map((c) => {
            const col = board?.[c.key];
            return (
              <section key={c.key} className="card" aria-label={c.title}>
                <div className="ph" style={{ marginBottom: 10 }}>
                  <h3>{c.title}</h3>
                  <span className="zc">{col ? fmtN(col.count) : '…'}</span>
                </div>
                {!col && <div className="empty">Loading…</div>}
                {col && col.rows.length === 0 && <div className="empty">Nothing here right now.</div>}
                {col && col.rows.map((e) => {
                  const s = sla(e);
                  const pl = pickLine(e);
                  const hot = s.state === 'br';
                  return (
                    <button key={e.issue_id} type="button" className={`kcard ${hot ? 'hot' : ''}`} onClick={() => setOpenId(e.issue_id)}>
                      <span className="id">{e.issue_id}</span>
                      <span className="cat">{e.issue_category || 'Uncategorised'}</span>
                      <span className="meta">{e.zone} · {e.concern_hub || '—'}</span>
                      <span className={pl?.cls || (s.state === 'br' ? 'sla-bad' : s.state === 'risk' ? 'sla-warn' : 'sla-ok')}>{pl?.text || s.text}</span>
                    </button>
                  );
                })}
                {col && col.count > col.rows.length && (
                  <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => chooseView(c.listView)}>Show all {fmtN(col.count)}</button>
                )}
              </section>
            );
          })}
        </div>
      )}
          </div>
        ) : (
          <div className="grid split">
            <div>
              {view === 'pick_failures' && <div className="box box-bad" style={{ marginBottom: 12 }}>Pick failures: a CM member missed the pick SLA and did not justify it within 24h, twice. Raised to the CM Lead.</div>}
              {view === 'failures' && <div className="box box-bad" style={{ marginBottom: 12 }}>Feedback failures: the KAM or CM owner missed the 24h window after 2 justifications. Raised to the Team Lead to record feedback.</div>}
          {isLead && selected.size > 0 && (
            <div className="bulk-bar" role="region" aria-label="Bulk KAM feedback">
              <b>{selected.size} selected</b>
              <button type="button" className="btn y sm" disabled={bulkBusy} onClick={() => bulkFeedback('Resolved')}>{bulkBusy ? 'Saving…' : 'Mark KAM feedback Resolved'}</button>
              <button type="button" className="btn sm" disabled={bulkBusy} onClick={() => bulkFeedback('Not Resolved')}>Mark Not Resolved</button>
              <button type="button" className="btn sm" disabled={bulkBusy} onClick={() => setSelected(new Set())}>Clear</button>
              <span className="bulk-note">Team leads only · up to 50 at a time</span>
            </div>
          )}
          {isLead && bulkMsg && <div className="box" role="status" style={{ margin: 14 }}>{bulkMsg}</div>}
              <div className="q" aria-label="Escalation queue">
            {list.rows.length === 0 && !loading && (
              <div className="empty">{view === 'failures' ? 'No feedback failures. Every owner is within the window or has given feedback.' : view === 'pick_failures' ? 'No pick failures. Every missed pick is justified or within its window.' : view === 'mine' ? 'No issues you raised or picked yet.' : 'No issues match this view. Clear a filter to see more.'}</div>
            )}
                {list.rows.map((e) => {
                  const s = sla(e);
                  const age = hoursSince(e.submitted_at);
                  const resDays = e.resolution_days || 3;
                  const pct = Math.min(100, Math.max(4, (age / (resDays * 24)) * 100));
                  const col = s.state === 'br' ? BRAND.flare : s.state === 'risk' ? BRAND.azure : '#00C98D';
                  const stCls = s.text === 'Resolved' ? 'p-res' : s.state === 'br' ? 'p-breach' : s.state === 'risk' ? 'p-wait' : 'p-ok';
                  const open = () => setOpenId(e.issue_id);
                  const stop = (ev) => ev.stopPropagation();
                  const who = initials(e.cm_assigned);
                  const pl = pickLine(e);
                  const fb = fbText(e);
                  return (
                    <div
                      key={e.issue_id}
                      className="qi"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open issue ${e.issue_id}`}
                      onClick={open}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {isLead && (
                            <span onClick={stop}>
                              <input type="checkbox" aria-label={`Select ${e.issue_id}`} checked={selected.has(e.issue_id)} onChange={() => toggleSel(e.issue_id)} style={{ width: 18, height: 18 }} />
                            </span>
                          )}
                          <span className={`pill ${PRI_PILL[e.priority_scale] || 'p-res'}`}>{e.priority_scale || '—'}</span>
                          <span className={`pill ${stCls}`}>{s.state === 'br' ? 'SLA breach' : s.state === 'risk' ? 'Due soon' : s.text === 'Resolved' ? 'Resolved' : 'On track'}</span>
                          {e.channel && <span className="muted small">{e.channel}</span>}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span className="mono">{e.issue_id}</span>
                          <b>{e.merchant_name || '—'}</b>
                          {e.consignment_id && (
                            <span onClick={stop} className="mono muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {e.consignment_id}<CopyButton text={e.consignment_id} label="Copy consignment ID" />
                            </span>
                          )}
                          {e.merchant_name && <span onClick={stop}><CopyButton text={e.merchant_name} label="Copy merchant name" /></span>}
                        </div>
                        <div className="meta">{e.issue_category || '—'} · {e.zone || '—'} · <span className="mono">{spanText(age)}</span></div>
                        <div className="qi-lines" style={{ display: 'grid', gap: 3, fontSize: 12.5, marginTop: 6 }}>
                          <div className={s.state === 'br' ? 'sla-bad' : s.state === 'risk' ? 'sla-warn' : 'sla-ok'}>{s.text}</div>
                          {pl && <div className={pl.cls}>{pl.text}</div>}
                          <div className={fb.cls}>{fb.text}</div>
                          <div>
                            {e.issue_response_datetime ? (
                              <span className="hub-resp">
                                <span className="hub-pill">Hub responded</span>{' '}
                                <span className="hub-time">{formatDhaka(e.issue_response_datetime)}</span>
                                {hubText(e) && <span className="hub-text" title={[e.layer1_response, e.layer2_response, e.layer3_response].filter(Boolean).join(' | ')}> · {hubText(e)}</span>}
                              </span>
                            ) : <span className="hub-wait">Awaiting hub response</span>}
                          </div>
                        </div>
                        {extraCols.ops && <div className="meta">Ops status: {e.ops_issue_status || '—'}</div>}
                        {extraCols.raiser && <div className="meta">Raised by: {e.email || '—'}</div>}
                        <div className="bar"><i style={{ width: `${pct}%`, background: col }} /></div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                        <span className="avatar" title="Owner" aria-label={`Owner ${who}`}>{who}</span>
                        <span className="btn primary" style={{ height: 32, fontSize: 12.5 }}>Open</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {showList && (
                <div className="pagebar" style={{ padding: '12px 4px' }}>
                  <span aria-live="polite">{list.count ? `Showing ${(page - 1) * PAGE + 1}–${Math.min(list.count, page * PAGE)} of ${fmtN(list.count)} issues` : '0 issues'}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
                    <span>Page {page} of {pages}</span>
                    <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</button>
                  </div>
                </div>
              )}
            </div>

            <aside className="stack" aria-label="Queue context">
              <div className="card">
                <div className="card-h"><div><h2>At a glance</h2><small>live · this scope</small></div><TrkIcon name="trend" /></div>
                <div className="grid g2" style={{ gap: 12 }}>
                  <div><div className="muted small">Open</div><div style={{ font: '700 30px var(--font)', letterSpacing: '-.02em' }}>{fmtN(k?.open)}</div></div>
                  <div><div className="muted small">Past SLA</div><div style={{ font: '700 30px var(--font)', letterSpacing: '-.02em', color: 'var(--bad)' }}>{fmtN(k?.breaches)}</div></div>
                </div>
              </div>
              {stats && (
                <div className="card">
                  <div className="card-h"><h2>Open by zone</h2><small>{fmtN(k?.open)}</small></div>
                  <div className="stackbar">
                    {zoneBars.map((z) => <i key={z.label} style={{ width: `${((z.value / zoneBarTotal) * 100).toFixed(2)}%`, background: z.color }} title={`${z.label} ${z.value}`} />)}
                  </div>
                  <div className="legend" style={{ marginTop: 12 }}>
                    {zoneBars.map((z) => <span key={z.label}><i style={{ background: z.color }} />{z.label} {fmtN(z.value)}</span>)}
                  </div>
                </div>
              )}
              {stats && (
                <div className="card">
                  <div className="card-h"><h2>Priority</h2><small>open</small></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: pieSvg(priRows.map((p) => ({ value: p.open, color: p.color })), 120) }} />
                    <div className="stack" style={{ gap: 8, flex: 1 }}>
                      {priRows.map((p) => (
                        <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                          {p.label}<b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.open)}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {k && (
          <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
            <div className="card-h" style={{ padding: '16px 20px 0' }}><div><h2>Pipeline · cases in scope</h2><small>where cases stall</small></div></div>
            <div className="pipe" style={{ gridTemplateColumns: `repeat(${stages.length}, 1fr)`, marginTop: 12 }}>
              {stages.map((st) => {
                const pct = total ? Math.round((st.value / total) * 100) : 0;
                return (
                  <div className="stage" key={st.label}>
                    <div className="muted small">{st.label}</div>
                    <div className="n">{fmtN(st.value)}</div>
                    <div className="muted small">{pct}% of {fmtN(total)}</div>
                    <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="note">Paged on the server, 20 per page, newest first. Click a card for the issue detail. Times are Asia/Dhaka. Exports include every row in the current view.</p>
      </div>

      <IssueDrawer issueId={openId} user={user} onClose={() => setOpenId(null)} onChanged={() => { load(); analytics.reload(); }} onOpen={setOpenId} />
    </div>
  );
}
