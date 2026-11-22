'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CopyButton from './CopyButton';
import { fmtN } from './cw/format';

// KAM Feedback tab. Lists only the Ops Issues named to the signed-in KAM (see lib/opsIssues.mjs).
// Uses the same classes as the tracker (ph, kpis, chips, qi cards, drawer), so it looks like the rest of the app.
// Each KAM writes free-text KAM Feedback (saved to sheet column J and to ops_issues).

const STATUS_PILL = { New: 'p-urg', Picked: 'p-wait', 'In Progress': 'p-wait', 'On Hold': 'p-crit', Resolved: 'p-ok', Unresolved: 'p-urg' };
const VALIDATION_PILL = { Valid: 'p-ok', Invalid: 'p-urg', Duplicate: 'p-crit', 'No proper info': 'p-crit' };
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting my feedback' },
  { key: 'added', label: 'Feedback added' },
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

function DetailPanel({ issue, onClose, onSaved }) {
  const [text, setText] = useState(issue.kam_feedback || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = text.trim() !== (issue.kam_feedback || '').trim();

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch(`/api/ops-issues/${encodeURIComponent(issue.issue_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kam_feedback: text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Save failed (${r.status})`);
      setMsg('Saved');
      onSaved(issue.issue_id, d.kam_feedback ?? null);
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
    ['Issue Status', issue.issue_status],
    ['Validation', issue.validation],
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
      </div>
      <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', margin: 0 }}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="muted small">{label}</dt>
              <dd style={{ margin: '2px 0 0', fontSize: 13.5 }}>{value || '—'}</dd>
            </div>
          ))}
        </dl>
        <div style={{ marginTop: 22 }}>
          <label htmlFor="kam-feedback" style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>KAM Feedback</label>
          {issue.can_edit ? (
            <>
              <textarea id="kam-feedback" className="inp" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', marginTop: 6, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <button type="button" className="btn y sm" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save feedback'}</button>
                {msg && <span role="status" className="small">{msg}</span>}
              </div>
            </>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>{issue.kam_feedback || '—'}</p>
          )}
        </div>
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

  function onSaved(id, value) {
    setIssues((list) => list.map((i) => (i.issue_id === id ? { ...i, kam_feedback: value } : i)));
  }

  const list = issues || [];
  const awaiting = list.filter((i) => i.can_edit && !i.kam_feedback).length;
  const added = list.filter((i) => !!i.kam_feedback).length;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list.filter((i) => {
      if (filter === 'awaiting' && !(i.can_edit && !i.kam_feedback)) return false;
      if (filter === 'added' && !i.kam_feedback) return false;
      if (!term) return true;
      return [i.issue_id, i.consignment_id, i.merchant_name].some((v) => String(v || '').toLowerCase().includes(term));
    });
  }, [list, filter, q]);

  const open = list.find((i) => i.issue_id === openId) || null;

  return (
    <div id="kam-issues">
      <div className="ph">
        <div>
          <div className="kicker">KAM feedback · Ops Issues · synced on load</div>
          <h1>KAM Feedback</h1>
          <p className="sub">Ops Issues named to you. Add your feedback for each one.</p>
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
            <div className="kpi"><div className="lab">Awaiting your feedback</div><div className="num">{fmtN(awaiting)}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Feedback added</div><div className="num">{fmtN(added)}</div></div>
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

      {!issues && !error && <p className="muted">Loading…</p>}

      <aside className={`drawer${open ? ' on' : ''}`} aria-label="Issue details" aria-hidden={!open}>
        {open && <DetailPanel key={open.issue_id} issue={open} onClose={() => setOpenId(null)} onSaved={onSaved} />}
      </aside>
    </div>
  );
}
