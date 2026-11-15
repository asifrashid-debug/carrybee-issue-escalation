'use client';
import { useCallback, useEffect, useState } from 'react';
import IssueDrawer from '../components/IssueDrawer';
import CopyButton from '../components/CopyButton';
import { useAnalytics } from '../components/useAnalytics';
import { PageHead, Kpi, LiveChip, PriPill, SlaPill, StatusPill, Zc, Bar, Donut, fmtN } from '../components/demo';
const PRI_COLOR = { P1: '#FF5D73', P2: '#FFB020', P3: '#A3A1A8', P4: '#6B6B73' };
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
function fbText(e) {
  if (e.feedback_phase === 'escalated') return { cls: 'sla-bad', text: 'Feedback failure · Team Lead' };
  if (e.feedback_phase === 'justification_due') return { cls: 'sla-bad', text: 'Feedback overdue · justification due' };
  if (e.feedback_phase === 'pending') {
    const left = Math.max(0, (new Date(e.feedback_due_at).getTime() - Date.now()) / 3600e3);
    return { cls: 'sla-warn', text: `Feedback due in ${left.toFixed(1)}h` };
  }
  return { cls: 'sla-ok', text: `Feedback: ${e.kam_feedback_status}` };
}

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

  const pages = Math.max(1, Math.ceil(list.count / PAGE));
  const k = stats?.kpi;
  const priOpen = stats ? stats.priorities.reduce((a, x) => a + x.open, 0) : 0;
  // Pipeline: live stage counts for the whole scope (no separate open-stage series exists yet)
  const pipe = k ? [
    { label: 'Submitted', value: k.total },
    { label: 'Picked', value: k.picked },
    { label: 'First response', value: k.responded },
    { label: 'Resolved', value: k.resolved },
    { label: 'Closed', value: k.closed },
  ] : [];
  const zoneOpen = stats ? stats.zones.map((z) => `${z.zone}: ${fmtN(z.open)}`).join(' · ') : '';
  const weekLabel = stats?.weeks?.[1] || '';
  const lastSynced = updated ? formatDhaka(updated.toISOString()) : '—';
  const visibleExtra = OPTIONAL.filter((c) => extraCols[c.key]);
  const colCount = 10 + visibleExtra.length + (isLead ? 1 : 0);
  const showList = ['all', 'mine', 'unpicked', 'awaiting', 'resolved_week', 'failures', 'pick_failures'].includes(view);

  return (
    <div className="dm">
      <PageHead kicker="Escalations" title="Issue Escalation Tracker" sub="Live escalation feed with aging, SLA and per-action audit log. Work the stages in order: pick, first comment, follow-up, resolve. Open any issue for its layers, follow-ups and audit trail.">
        <LiveChip label={`Live · Asia/Dhaka · synced ${lastSynced}`} />
      </PageHead>

      <div className="grid g4 kpi-strip">
        <Kpi label="Open escalations" value={fmtN(k?.open)} sub={stats ? zoneOpen : '…'} icon="shield" />
        <Kpi label="Unpicked queue" value={fmtN(k?.unpicked)} sub="Waiting for hub pick" icon="alert" tone="r" hot />
        <Kpi label="Awaiting first response" value={fmtN(k?.awaitingResponse)} sub="Open, no first comment yet" icon="clock" tone="b" />
        <Kpi label={`Resolved this week${weekLabel ? ` (${weekLabel})` : ''}`} value={fmtN(resolvedWeek)} sub="Ops status Resolved this week" icon="check" tone="g" />
      </div>

      <div className="trk-layout">
        <div className="trk-main">
      <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="views" role="group" aria-label="Tracker views">
          <span className="lb">Views:</span>
          {views.map((v) => (
            <button key={v.key} type="button" className={activeKey === v.key ? 'on' : ''} aria-pressed={activeKey === v.key} onClick={() => chooseView(v.key)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label className="search">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input type="search" placeholder="Search Issue ID (CB-…), Consignment ID, or Merchant name" aria-label="Search issues" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn" aria-expanded={panel === 'filters'} onClick={() => setPanel(panel === 'filters' ? null : 'filters')}>
            Filters{filterCount ? ` (${filterCount})` : ''}
          </button>
          <button type="button" className="btn" aria-expanded={panel === 'columns'} onClick={() => setPanel(panel === 'columns' ? null : 'columns')}>
            Columns ({9 + visibleExtra.length}/{9 + OPTIONAL.length})
          </button>
          <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" className="btn" disabled={exporting} onClick={() => doExport('csv')}>CSV</button>
          <button type="button" className="btn g" disabled={exporting} onClick={() => doExport('xls')}>{exporting ? 'Exporting…' : 'Excel (XML)'}</button>
        </div>

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

      {error && <div className="box box-bad" role="alert">Could not load issues: {error}</div>}

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

      {showList && (
        <div className="card" style={{ padding: 0 }}>
          {view === 'pick_failures' && <div className="box box-bad" style={{ margin: 14 }}>Pick failures: a CM member missed the pick SLA and did not justify it within 24h, twice. Raised to the CM Lead.</div>}
          {view === 'failures' && <div className="box box-bad" style={{ margin: 14 }}>Feedback failures: the KAM or CM owner missed the 24h window after 2 justifications. Raised to the Team Lead to record feedback.</div>}
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
          <div className="tbl-wrap">
            <table className="tbl tbl-stack">
              <thead>
                <tr>
                  {isLead && <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all on this page" checked={pageAllSelected} onChange={togglePage} /></th>}
                  <th>Hub response</th><th>Issue ID</th><th>Aging &amp; SLA</th><th>Timestamp (Dhaka) ↓</th><th>Consignment / Merchant</th><th>Channel</th><th>Zone</th><th>Concern Hub</th><th>Issue Status</th><th>Category</th>
                  {visibleExtra.map((c) => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.rows.length === 0 && !loading && (
                  <tr><td colSpan={colCount}><div className="empty">{view === 'failures' ? 'No feedback failures. Every owner is within the window or has given feedback.' : view === 'pick_failures' ? 'No pick failures. Every missed pick is justified or within its window.' : view === 'mine' ? 'No issues you raised or picked yet.' : 'No issues match this view. Clear a filter to see more.'}</div></td></tr>
                )}
                {list.rows.map((e) => {
                  const s = sla(e);
                  const fb = fbText(e);
                  const pl = pickLine(e);
                  const age = hoursSince(e.submitted_at);
                  return (
                    <tr key={e.issue_id} className="rw" onClick={() => setOpenId(e.issue_id)}>
                      {isLead && (
                        <td className="sel" data-label="Select" onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select ${e.issue_id}`} checked={selected.has(e.issue_id)} onChange={() => toggleSel(e.issue_id)} />
                        </td>
                      )}
                      <td className="hub-col" data-label="Hub response">
                        {e.issue_response_datetime ? (
                          <div className="hub-resp">
                            <span className="hub-pill">Hub responded</span>
                            <span className="hub-time">{formatDhaka(e.issue_response_datetime)}</span>
                            {hubText(e) && <span className="hub-text" title={[e.layer1_response, e.layer2_response, e.layer3_response].filter(Boolean).join(' | ')}>{hubText(e)}</span>}
                          </div>
                        ) : <span className="hub-wait">Awaiting hub response</span>}
                      </td>
                      <td data-label="Issue ID"><span className="idc">{e.issue_id}</span></td>
                      <td data-label="Aging & SLA">
                        <SlaPill state={s.state} /> <span className="mono" style={{ color: 'var(--mut)' }}>{age.toFixed(1)}h</span>
                        <div className={s.state === 'br' ? 'sla-bad' : s.state === 'risk' ? 'sla-warn' : 'sla-ok'} style={{ fontSize: 11.5 }}>{s.text}</div>
                        <div className={fb.cls} style={{ fontSize: 11.5 }}>{fb.text}</div>
                        {pl && <div className={pl.cls} style={{ fontSize: 11.5 }}>{pl.text}</div>}
                      </td>
                      <td className="mono" data-label="Timestamp">{formatDhaka(e.submitted_at)}</td>
                      <td style={{ maxWidth: 300 }} data-label="Consignment / Merchant">
                        <div className="copy-cell">
                          <span className="copy-val mono">{e.consignment_id || '—'}</span><CopyButton text={e.consignment_id} label="Copy consignment ID" />
                          <span className="copy-val" style={{ flexBasis: '100%' }}>{e.merchant_name || '—'}</span>{e.merchant_name && <CopyButton text={e.merchant_name} label="Copy merchant name" />}
                        </div>
                      </td>
                      <td data-label="Channel"><span className={`pillc ${e.channel === 'MX' ? 'p-open' : 'p-B'}`}>{e.channel || '—'}</span></td>
                      <td data-label="Zone"><Zc z={e.zone} /></td>
                      <td data-label="Concern Hub">{e.concern_hub || '—'}</td>
                      <td data-label="Issue Status"><StatusPill s={e.issue_status} /></td>
                      <td data-label="Category">{e.issue_category || '—'}</td>
                      {extraCols.prio && <td data-label="Priority"><PriPill p={e.priority_scale} /></td>}
                      {extraCols.ops && <td data-label="Ops Status">{e.ops_issue_status || '—'}</td>}
                      {extraCols.raiser && <td data-label="Raised by">{e.email || '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pagebar" style={{ padding: '12px 14px' }}>
            <span aria-live="polite">{list.count ? `Showing ${(page - 1) * PAGE + 1}–${Math.min(list.count, page * PAGE)} of ${fmtN(list.count)} issues` : '0 issues'}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}

        </div>

        {stats && (
          <aside className="trk-side only-desk" aria-label="Queue context">
            <div className="card">
              <div className="ph"><div><h3>At a glance</h3><small>Live counts from the queue</small></div></div>
              <div className="grid g2" style={{ gap: 12, marginBottom: 0 }}>
                <div><div className="kl">Open</div><div className="kv" style={{ fontSize: 28 }}>{fmtN(stats.kpi.open)}</div></div>
                <div><div className="kl">SLA breaches</div><div className="kv" style={{ fontSize: 28, color: 'var(--bad)' }}>{fmtN(stats.kpi.breaches)}</div></div>
              </div>
            </div>
            <div className="card">
              <div className="ph"><div><h3>Open by Zone</h3><small>Share of open queue</small></div></div>
              <div className="lst">
                {stats.zones.map((z) => (
                  <div key={z.zone}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{z.zone}</span><b>{fmtN(z.open)}</b></div>
                    <Bar pct={stats.kpi.open ? (z.open / stats.kpi.open) * 100 : 0} color={{ ISD: '#F8C800', OSD: '#3B9CFF', CTG: '#A78BFA' }[z.zone]} />
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="ph"><div><h3>Priority Mix</h3><small>Open issues by priority</small></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Donut segments={stats.priorities.map((p) => ({ label: p.label, value: p.open, color: PRI_COLOR[p.label] }))} center={fmtN(priOpen)} sub="open" size={120} stroke={14} />
                <div className="lst" style={{ flex: 1, minWidth: 120 }}>
                  {stats.priorities.map((p) => (
                    <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span><b style={{ color: PRI_COLOR[p.label] }}>●</b> {p.label}</span><b>{fmtN(p.open)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="ph"><div><h3>Top Categories</h3><small>All issues · top 5</small></div></div>
              {stats.categories.length === 0 ? <div className="empty">No categories yet</div> : (
                <div className="lst">
                  {stats.categories.slice(0, 5).map((c) => (
                    <div key={c.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{c.label}</span><b>{fmtN(c.count)}</b></div>
                      <Bar pct={(c.count / Math.max(1, stats.categories[0].count)) * 100} color="#F8C800" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {k && (
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <div className="ph" style={{ padding: '16px 20px 0' }}><div><h3>Pipeline</h3><small>Cases that reached each stage · live</small></div></div>
          <div className="pipe pipe-grid" style={{ marginTop: 12 }}>
            {pipe.map((s, i) => (
              <div key={s.label} style={{ padding: '12px 18px', borderLeft: i ? '1px solid var(--line)' : 'none', minWidth: 0 }}>
                <div className="muted small">{s.label}</div>
                <div className="mono" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{fmtN(s.value)}</div>
                <div className="muted small">{k.total ? Math.round((s.value / k.total) * 100) : 0}% of submitted</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="note2">Paged on the server, 20 per page, newest first. Click a row for the issue detail. Times are Asia/Dhaka. Exports include every row in the current view.</p>

      <IssueDrawer issueId={openId} user={user} onClose={() => setOpenId(null)} onChanged={() => { load(); analytics.reload(); }} onOpen={setOpenId} />
    </div>
  );
}
