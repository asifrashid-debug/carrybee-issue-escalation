'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CopyButton from './CopyButton';
import { fmtN } from './cw/format';
import { formatDhaka } from '../lib/time';
import { VALIDATIONS, CLOSED_STATUSES, dueState } from '../lib/opsLifecycle.mjs';

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
  const [issues, setIssues] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/ops-issues', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Load failed (${r.status})`);
      setIssues(d.issues || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function onChange(id, patch) {
    setIssues((list) => (list || []).map((i) => (i.issue_id === id ? { ...i, ...patch } : i)));
  }

  const list = issues || [];
  const clock = now || new Date(0);
  const overdueOf = (i) => !!now && dueState(i, clock).overdue;
  const toPick = list.filter((i) => i.issue_status === 'Raised').length;
  const overdue = list.filter(overdueOf).length;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list.filter((i) => {
      if (filter === 'pick' && i.issue_status !== 'Raised') return false;
      if (filter === 'open' && !['Picked', 'In Progress'].includes(i.issue_status)) return false;
      if (filter === 'closed' && !CLOSED_STATUSES.includes(i.issue_status)) return false;
      if (filter === 'overdue' && !overdueOf(i)) return false;
      if (!term) return true;
      return [i.issue_id, i.consignment_id, i.merchant_name].some((v) => String(v || '').toLowerCase().includes(term));
    });
    // overdueOf depends on now; the list is recomputed when now changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, filter, q, now]);

  const open = list.find((i) => i.issue_id === openId) || null;

  return (
    <div id="kam-issues">
      <div className="ph">
        <div>
          <div className="kicker">Ops-KAM · Ops Issues · pick within 30 min · close within 24 h</div>
          <h1>Ops-KAM</h1>
          <p className="sub">Ops Issues named to you. Pick each one, move it through to closed, validate it, and add your feedback.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search issue ID, consignment or merchant"
              aria-label="Search issues"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: 'inherit' }}
            />
          </label>
          <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="card" role="alert">{error}</div>}

      {issues && (
        <>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi"><div className="lab">Named to you</div><div className="num">{fmtN(list.length)}</div></div>
            <div className="kpi"><div className="lab">To pick</div><div className="num">{fmtN(toPick)}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Overdue</div><div className="num">{fmtN(overdue)}</div></div>
          </div>

          <div className="chips" role="group" aria-label="KAM views" style={{ margin: '16px 0' }}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={`chip${filter === f.key ? ' on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <div className="card muted">{list.length === 0 ? 'No Ops Issues are named to you.' : 'Nothing matches this view.'}</div>
          )}

          {shown.map((i) => {
            const fb = feedbackLine(i);
            const lines = dueLines(i, now);
            return (
              <div
                key={i.issue_id}
                className="qi"
                role="button"
                tabIndex={0}
                aria-label={`Open issue ${i.issue_id}`}
                onClick={() => setOpenId(i.issue_id)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpenId(i.issue_id); } }}
                style={{ marginBottom: 10 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`pill ${STATUS_PILL[i.issue_status] || 'p-res'}`}>{i.issue_status || 'No status'}</span>
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
        </>
      )}

      <aside className={`drawer${open ? ' on' : ''}`} aria-label="Issue details" aria-hidden={!open}>
        {open && <DetailPanel key={open.issue_id} issue={open} now={now} onClose={() => setOpenId(null)} onChange={onChange} />}
      </aside>
    </div>
  );
}
