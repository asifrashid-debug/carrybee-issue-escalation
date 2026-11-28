'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CopyButton from './CopyButton';
import { fmtN } from './cw/format';
import { formatDhaka } from '../lib/time';
import { VALIDATIONS, CLOSED_STATUSES, dueState } from '../lib/opsLifecycle.mjs';
import ErrorBoundary from './ErrorBoundary';
import { markOpsIssuesSeen, readOpsSeen } from './useOpsBadge';
import { OPS_SOURCE_TABS, OPS_SORT_OPTIONS } from '../lib/opsIssues.mjs';
import { isOverdue } from '../lib/opsListView.mjs';
import { useVisibleInterval } from './cw/useVisibleInterval';
import { unseenCount } from '../lib/opsBadge.mjs';

// KAM Feedback tab. Lists only the Ops Issues named to the signed-in KAM (see lib/opsIssues.mjs).
// Uses the tracker's classes (ph, kpis, chips, qi cards, drawer), so it looks like the rest of the app.
// Lifecycle: Raised (automatic) -> Picked -> In Progress -> Resolved or Not Resolved.
// Pick within 30 minutes of Raised. Close (Resolved or Not Resolved) within 24 hours of Raised. Late is flagged, not blocked.
// Validation (Valid, Invalid, Duplicate, No proper info) and KAM Feedback (free text) can be set by the named KAM.

const STATUS_PILL = { Raised: 'p-urg', Picked: 'p-wait', 'In Progress': 'p-wait', Resolved: 'p-ok', 'Not Resolved': 'p-crit' };
const VALIDATION_PILL = { Valid: 'p-ok', Invalid: 'p-urg', Duplicate: 'p-crit', 'No proper info': 'p-crit' };
const NEXT_ACTIONS = {
  Raised: [{ action: 'pick', label: 'Pick issue' }],
  Picked: [{ action: 'start', label: 'Mark In Progress' }],
  'In Progress': [{ action: 'resolve', label: 'Mark Resolved' }, { action: 'not_resolved', label: 'Mark Not Resolved' }],
};
const STEPS = ['Raised', 'Picked', 'In Progress', 'Closed'];
const OPS_PAGE_SIZE = 100;
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pick', label: 'To pick' },
  { key: 'open', label: 'Picked / in progress' },
  { key: 'closed', label: 'Closed' },
  { key: 'overdue', label: 'Overdue' },
];

// Owner avatar: initials only, never the full name.
function initials(n) {
  const p = String(n || '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return p.map((x) => x[0].toUpperCase()).join('') || '?';
}

function feedbackLine(i) {
  if (i.kam_feedback) return { cls: 'sla-ok', text: 'KAM feedback saved' };
  if (i.can_edit) return { cls: 'sla-bad', text: 'KAM feedback needed' };
  return { cls: 'muted small', text: 'No KAM feedback yet' };
}

// The deadline lines for an issue, from the due state at time now.
function dueLines(i, now) {
  if (!now) return [];
  const d = dueState(i, now);
  const out = [];
  if (d.pick === 'pick_due') out.push({ cls: 'muted small', text: `Pick by ${formatDhaka(i.pick_due_at)} · ${d.minutesToPick} min left` });
  if (d.pick === 'pick_overdue') out.push({ cls: 'sla-bad', text: `Pick overdue by ${-d.minutesToPick} min (was due ${formatDhaka(i.pick_due_at)})` });
  if (d.pick === 'picked_on_time') out.push({ cls: 'sla-ok', text: 'Picked on time' });
  if (d.pick === 'picked_late') out.push({ cls: 'sla-bad', text: 'Picked late' });
  if (d.resolve === 'resolve_due') out.push({ cls: 'muted small', text: `Close by ${formatDhaka(i.resolve_due_at)} · ${Math.abs(d.hoursToResolve)} h left` });
  if (d.resolve === 'resolve_overdue') out.push({ cls: 'sla-bad', text: `Close overdue (was due ${formatDhaka(i.resolve_due_at)})` });
  if (d.resolve === 'closed_on_time') out.push({ cls: 'sla-ok', text: 'Closed on time' });
  if (d.resolve === 'closed_late') out.push({ cls: 'sla-bad', text: 'Closed late' });
  return out;
}

function stepIndex(status) {
  if (CLOSED_STATUSES.includes(status)) return 3;
  return Math.max(0, ['Raised', 'Picked', 'In Progress'].indexOf(status));
}

function DetailPanel({ issue, now, onClose, onChange }) {
  const [text, setText] = useState(issue.kam_feedback || '');
  const [validation, setValidation] = useState(issue.validation || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const feedbackDirty = text.trim() !== (issue.kam_feedback || '').trim();
  const validationDirty = validation !== (issue.validation || '');
  const next = NEXT_ACTIONS[issue.issue_status] || [];
  const current = stepIndex(issue.issue_status);

  // One PATCH per action. The list row is updated from the response.
  async function send(body, done) {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch(`/api/ops-issues/${encodeURIComponent(issue.issue_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Save failed (${r.status})`);
      const patch = { ...d };
      delete patch.issue_id;
      onChange(issue.issue_id, patch);
      setMsg(done);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    ['Consignment ID', issue.consignment_id],
    ['Merchant Name', issue.merchant_name],
    ['HUB Name', issue.hub_name || 'Not set'],
    ['Zone', issue.zone],
    ['Issue Category', issue.issue_category || 'To be uploaded'],
    ['Issue Sub Category', issue.issue_sub_category],
    ['HUB Feedback', issue.hub_feedback || 'Awaiting HUB'],
    ['Raised', issue.raised_at ? formatDhaka(issue.raised_at) : null],
    ['Picked', issue.picked_at ? `${formatDhaka(issue.picked_at)}${issue.picked_by ? ` · ${issue.picked_by}` : ''}` : null],
    ['Closed', issue.closed_at ? `${formatDhaka(issue.closed_at)}${issue.closed_by ? ` · ${issue.closed_by}` : ''}` : null],
    ['Validated', issue.validated_at ? `${formatDhaka(issue.validated_at)}${issue.validated_by ? ` · ${issue.validated_by}` : ''}` : null],
  ];

  return (
    <>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <span className="mono">{issue.issue_id}</span>
          <button type="button" className="xb" aria-label="Close issue" onClick={onClose}>×</button>
        </div>
        <h2 style={{ fontSize: 18, margin: '10px 0 4px' }}>{issue.merchant_name || 'Merchant to be confirmed'}</h2>
        <div className="muted small">{issue.issue_category || 'Category to be uploaded'} · {issue.issue_sub_category || '—'}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span className={`pill ${STATUS_PILL[issue.issue_status] || 'p-res'}`}>{issue.issue_status || 'No status'}</span>
          <span className={`pill ${VALIDATION_PILL[issue.validation] || 'p-res'}`}>{issue.validation || 'Validation pending'}</span>
        </div>
        <ol aria-label="Progress" style={{ display: 'flex', gap: 6, listStyle: 'none', padding: 0, margin: '14px 0 0', flexWrap: 'wrap' }}>
          {STEPS.map((s, idx) => {
            const label = idx === 3 && CLOSED_STATUSES.includes(issue.issue_status) ? issue.issue_status : s;
            const done = idx < current;
            const on = idx === current;
            return (
              <li key={s} aria-current={on ? 'step' : undefined} className={on ? 'pill p-wait' : 'pill p-res'} style={{ opacity: done || on ? 1 : 0.55, fontWeight: on ? 700 : 500 }}>
                {done ? '✓ ' : ''}{label}
              </li>
            );
          })}
        </ol>
        {dueLines(issue, now).map((l) => (
          <div key={l.text} className={l.cls} style={{ marginTop: 8, fontSize: 12.5 }}>{l.text}</div>
        ))}
      </div>

      <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        {issue.can_edit && next.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {next.map((n, idx) => (
              <button
                key={n.action}
                type="button"
                className={idx === 0 ? 'btn primary sm' : 'btn sm'}
                disabled={busy}
                onClick={() => send({ action: n.action }, `Status set to ${n.action === 'pick' ? 'Picked' : n.action === 'start' ? 'In Progress' : n.action === 'resolve' ? 'Resolved' : 'Not Resolved'}`)}
              >
                {n.label}
              </button>
            ))}
          </div>
        )}

        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', margin: 0 }}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="muted small">{label}</dt>
              <dd style={{ margin: '2px 0 0', fontSize: 13.5 }}>{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <div style={{ marginTop: 22 }}>
          <label htmlFor="kam-validation" style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>Validation</label>
          {issue.can_edit ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <select id="kam-validation" className="inp" value={validation} onChange={(e) => setValidation(e.target.value)}>
                <option value="">Not validated</option>
                {VALIDATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <button type="button" className="btn y sm" disabled={busy || !validation || !validationDirty} onClick={() => send({ validation }, 'Validation saved')}>Save validation</button>
            </div>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>{issue.validation || '—'}</p>
          )}
        </div>

        <div style={{ marginTop: 22 }}>
          <label htmlFor="kam-feedback" style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>KAM Feedback</label>
          {issue.can_edit ? (
            <>
              <textarea id="kam-feedback" className="inp" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', marginTop: 6, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <button type="button" className="btn y sm" onClick={() => send({ kam_feedback: text }, 'Saved')} disabled={busy || !feedbackDirty}>{busy ? 'Saving…' : 'Save feedback'}</button>
              </div>
            </>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>{issue.kam_feedback || '—'}</p>
          )}
        </div>

        {msg && <div role="status" className="small" style={{ marginTop: 16 }}>{msg}</div>}
      </div>
    </>
  );
}

export default function KamIssues() {
  // The page of issues, the counts for every tab, and the Raised references, all from the server.
  const [view, setView] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  // Pages shown so far. Each page is OPS_PAGE_SIZE issues. Only one page is ever rendered or sent over the network.
  const [pages, setPages] = useState(1);
  const shownCount = pages * OPS_PAGE_SIZE;
  const [qd, setQd] = useState('');
  const [viewer, setViewer] = useState('');
  const [seen, setSeen] = useState(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(null);

  // The countdowns refresh every 30 seconds. The first value is set after mount, so server and browser render the same.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Search waits 250 ms after typing stops, so each keystroke does not send a request.
  useEffect(() => { const t = setTimeout(() => setQd(q), 250); return () => clearTimeout(t); }, [q]);

  // A change of view starts again at the first page.
  const pickSource = (k) => { setSource(k); setPages(1); };
  const pickFilter = (k) => { setFilter(k); setPages(1); };
  const pickSort = (k) => { setSortOrder(k); setPages(1); };
  const pickQuery = (v) => { setQ(v); setPages(1); };

  const queryString = useMemo(
    () => new URLSearchParams({ source, filter, sort: sortOrder, q: qd, size: String(shownCount) }).toString(),
    [source, filter, sortOrder, qd, shownCount],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/ops-issues?${queryString}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Load failed (${r.status})`);
      setView({ issues: d.issues || [], total: d.total || 0, counts: d.counts || {}, raised: d.raised || [] });
      setViewer(d.viewer || '');
      setSeen(readOpsSeen(d.viewer));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { load(); }, [load]);
  // Counts, overdue and badges move with time, so the list refreshes every minute while the tab is visible.
  useVisibleInterval(() => { load(); }, 60000);

  // Opening a source tab marks its Raised issues as seen, so that tab's badge clears. The All tab marks nothing.
  useEffect(() => {
    if (!view || !viewer || source === 'all') return;
    const tabRaised = view.raised.filter((r) => r.source === source);
    setSeen(markOpsIssuesSeen(viewer, view.raised, tabRaised));
  }, [view, viewer, source]);

  // Edits from the drawer update the page and the open row at once, then the counts are reloaded.
  function onChange(id, patch) {
    setView((v) => (v ? { ...v, issues: v.issues.map((i) => (i.issue_id === id ? { ...i, ...patch } : i)) } : v));
    setOpenRow((r) => (r && r.issue_id === id ? { ...r, ...patch } : r));
    load();
  }

  const raisedIn = (tab) => (view?.raised || []).filter((r) => tab === 'all' || r.source === tab);
  const unseenIn = (tab) => (seen && view ? unseenCount(raisedIn(tab), seen) : 0);
  const counts = view?.counts?.[source] || { named: 0, toPick: 0, overdue: 0 };
  const allNamed = view?.counts?.all?.named || 0;
  const overdueOf = (i) => isOverdue(i, now);

  function openIssue(i) { setOpenRow(i); setOpenId(i.issue_id); }
  const open = openId ? (view?.issues.find((i) => i.issue_id === openId) || (openRow?.issue_id === openId ? openRow : null)) : null;

  return (
    <div id="kam-issues">
      <div className="ph">
        <div>
          <div className="kicker">Ops-KAM · Ops Issues · pick within 30 min · close within 24 h</div>
          <h1>Ops-KAM</h1>
          <p className="sub">Ops Issues named to you. Pick each one, move it through to closed, validate it, and add your feedback.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="search" style={{ minWidth: 340, flex: '1 1 340px', maxWidth: 460 }}>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search ID, consignment or merchant"
              aria-label="Search issues"
              value={q}
              onChange={(e) => pickQuery(e.target.value)}
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: 'inherit' }}
            />
          </label>
          <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="card" role="alert">{error}</div>}

      {view && (
        <>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi"><div className="lab">Named to you</div><div className="num">{fmtN(counts.named)}</div></div>
            <div className="kpi"><div className="lab">To pick</div><div className="num">{fmtN(counts.toPick)}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Overdue</div><div className="num">{fmtN(counts.overdue)}</div></div>
          </div>

          <div className="chips" role="tablist" aria-label="Issue sources" style={{ marginTop: 16 }}>
            {OPS_SOURCE_TABS.map((t) => {
              const n = unseenIn(t.key);
              const on = source === t.key;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} className={`chip${on ? ' on' : ''}`} onClick={() => pickSource(t.key)}>
                  {t.label}
                  {n > 0 && <span className="tab-badge" aria-label={`${n} new`}>{n > 99 ? '99+' : n}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0' }}>
            <div className="chips" role="group" aria-label="KAM views">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className={`chip${filter === f.key ? ' on' : ''}`} aria-pressed={filter === f.key} onClick={() => pickFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', font: '600 12.5px var(--font)', color: 'var(--mut)' }}>
              Sort
              <select aria-label="Sort issues" value={sortOrder} onChange={(e) => pickSort(e.target.value)} style={{ height: 34, minWidth: 150, flexShrink: 0, borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', color: 'inherit', padding: '0 12px', font: 'inherit' }}>
                {OPS_SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {view && view.total === 0 && (
            <div className="card muted">{allNamed === 0 ? 'No Ops Issues are named to you.' : counts.named === 0 ? 'No issues from this source are named to you.' : 'Nothing matches this view.'}</div>
          )}

          {(view?.issues || []).map((i, idx) => {
            const fb = feedbackLine(i);
            const lines = dueLines(i, now);
            return (
              <div
                key={i.issue_id}
                className={`qi ops-card${idx < 12 ? ' ops-enter' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Open issue ${i.issue_id}`}
                onClick={() => openIssue(i)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openIssue(i); } }}
                style={{ marginBottom: 10, animationDelay: `${Math.min(idx, 11) * 45}ms` }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`pill ${STATUS_PILL[i.issue_status] || 'p-res'}${i.issue_status === 'Raised' ? ' ops-pulse' : ''}`}>{i.issue_status || 'No status'}</span>
                    <span className={`pill ${VALIDATION_PILL[i.validation] || 'p-res'}`}>{i.validation || 'Validation pending'}</span>
                    {overdueOf(i) && <span className="pill p-breach">Overdue</span>}
                    {i.kam_feedback ? <span className="pill p-ok">Feedback added</span> : i.can_edit ? <span className="pill p-urg">Feedback needed</span> : null}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span className="mono">{i.issue_id}</span>
                    <b>{i.merchant_name || '—'}</b>
                    {i.consignment_id && (
                      <span onClick={(ev) => ev.stopPropagation()} className="mono muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {i.consignment_id}<CopyButton text={i.consignment_id} label="Copy consignment ID" />
                      </span>
                    )}
                  </div>
                  <div className="meta">{i.issue_category || 'Category to be uploaded'} · {i.issue_sub_category || '—'}</div>
                  <div className="muted small" style={{ marginTop: 4 }}>HUB name: <b>{i.hub_name || 'Not set'}</b> · Zone: <b>{i.zone || '—'}</b></div>
                  <div style={{ display: 'grid', gap: 3, fontSize: 12.5, marginTop: 6 }}>
                    {lines.map((l) => <div key={l.text} className={l.cls}>{l.text}</div>)}
                    <div className={fb.cls}>{fb.text}</div>
                    <div className="muted small">{i.hub_feedback ? `HUB: ${i.hub_feedback}` : 'Awaiting HUB feedback'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                  <span className="avatar" title="KAM" aria-label={`KAM ${i.kam_name || ''}`}>{initials(i.kam_name)}</span>
                  <span className="btn primary" style={{ height: 32, fontSize: 12.5 }}>Open</span>
                </div>
              </div>
            );
          })}
          {view && view.total > view.issues.length && (
            <div className="card muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>Showing {view.issues.length.toLocaleString()} of {view.total.toLocaleString()}</span>
              <button type="button" className="btn" onClick={() => setPages((p) => p + 1)}>Show {Math.min(OPS_PAGE_SIZE, view.total - view.issues.length).toLocaleString()} more</button>
            </div>
          )}
        </>
      )}

      <aside className={`drawer${open ? ' on' : ''}`} aria-label="Issue details" aria-hidden={!open}>
        {open && <ErrorBoundary><DetailPanel key={open.issue_id} issue={open} now={now} onClose={() => setOpenId(null)} onChange={onChange} /></ErrorBoundary>}
      </aside>
    </div>
  );
}
