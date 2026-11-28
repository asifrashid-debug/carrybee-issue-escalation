'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ErrorBoundary from './ErrorBoundary';
import RouteAnalytics from './RouteAnalytics';
import { getMe } from './cw/meClient';
import TrackerCard from './TrackerCard';

// Same drawer as the tracker: Activity log, KAM feedback and its outcome.
const IssueDrawer = dynamic(() => import('./IssueDrawer'), { ssr: false });

// Route tab (Central Sort or TNL): every escalation the KAM ticked for that route, and nothing else.
// Each issue is a tracker card (components/TrackerCard.js), the same card as the main tracker. Data: GET /api/escalations?route=central_sort (or tnl).
// Visibility follows the same scope rules as the tracker. Ops Status and Validation come from the
// Ops Issues tracker, which writes them back to the response sheet.
// route: 'central_sort' | 'tnl'. label: tab title used in the heading.
export default function RouteIssues({ route, label, sheetName }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // issue_id of the open drawer
  const [me, setMe] = useState(null);

  useEffect(() => { getMe().then(setMe).catch(() => {}); }, []);
  const user = me || { email: '', role: '—' };

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/escalations?route=${encodeURIComponent(route)}&pageSize=100`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || `Could not load ${label} issues`);
        setRows(j.data || []); setCount(j.count ?? (j.data || []).length); setErr(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [route, label]);

  useEffect(() => { load(); }, [load]);

  const rowKey = route === 'tnl' ? 'tnl_sheet_row' : 'central_sort_sheet_row';

  return (
    <div className="trk-page">
      <div className="ph">
        <div>
          <div className="kicker">{label}</div>
          <h1>{label} Issues</h1>
          <p className="sub">
            Issues the KAM sent to {label} ({sheetName} response sheet). Only issues ticked for {label} appear here. Click an issue to open its log and KAM feedback.
          </p>
        </div>
        <button type="button" className="ibtn" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {err && <div className="err on" role="alert" style={{ margin: '12px 24px' }}>{err}</div>}
      <RouteAnalytics route={route} label={label} />
      <div style={{ padding: '12px 24px', overflowX: 'auto' }}>
        <div className="hint" style={{ marginBottom: 8 }}>
          {count} {label} issue{count === 1 ? '' : 's'}{count > rows.length ? ` (showing the latest ${rows.length})` : ''}
        </div>
        {!loading && rows.length === 0 && !err && <div className="card muted">No {label} issues yet.</div>}
        {rows.map((r) => (
          <TrackerCard
            key={r.issue_id}
            e={r}
            onOpen={setOpenId}
            extraLines={[{ cls: 'muted small', text: `Ops Status: ${r.ops_status || '—'} · Validation: ${r.validation || '—'} · Sheet row: ${r[rowKey] ?? '—'}` }]}
          />
        ))}
      </div>
      {openId && <ErrorBoundary><IssueDrawer issueId={openId} user={user} onClose={() => setOpenId(null)} onChanged={load} onOpen={setOpenId} /></ErrorBoundary>}
    </div>
  );
}
