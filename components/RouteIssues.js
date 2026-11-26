'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { formatDhaka } from '../lib/time';
import ErrorBoundary from './ErrorBoundary';
import { getMe } from './cw/meClient';

// Same drawer as the tracker: Activity log, KAM feedback and its outcome.
const IssueDrawer = dynamic(() => import('./IssueDrawer'), { ssr: false });

// Route tab (Central Sort or TNL): every escalation the KAM ticked for that route, and nothing else.
// Same pattern as the IR Issues tab. Data: GET /api/escalations?route=central_sort (or tnl).
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

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--mut)', borderBottom: '1px solid var(--line, #ddd)', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--line, #eee)', verticalAlign: 'top' };
  const rowKey = route === 'tnl' ? 'tnl_sheet_row' : 'central_sort_sheet_row';

  return (
    <>
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
      <div style={{ padding: '12px 24px', overflowX: 'auto' }}>
        <div className="hint" style={{ marginBottom: 8 }}>
          {count} {label} issue{count === 1 ? '' : 's'}{count > rows.length ? ` (showing the latest ${rows.length})` : ''}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Issue ID</th><th style={th}>Raised (Dhaka)</th><th style={th}>Zone</th><th style={th}>HUB</th>
              <th style={th}>Consignment ID</th><th style={th}>Merchant</th><th style={th}>Category</th>
              <th style={th}>Ops Status</th><th style={th}>Validation</th><th style={th}>Sheet row</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.issue_id} onClick={() => setOpenId(r.issue_id)} style={{ cursor: 'pointer', background: openId === r.issue_id ? 'var(--hover, rgba(0,0,0,.04))' : undefined }}>
                <td style={td}><b>{r.issue_id}</b></td>
                <td style={td}>{formatDhaka(r.submitted_at)}</td>
                <td style={td}>{r.zone || '—'}</td>
                <td style={td}>{r.concern_hub || '—'}</td>
                <td style={td}>{r.consignment_id || '—'}</td>
                <td style={td}>{r.merchant_name || '—'}</td>
                <td style={td}>{r.issue_category || '—'}<br /><small>{r.issue_sub_category}</small></td>
                <td style={td}>{r.ops_status || '—'}</td>
                <td style={td}>{r.validation || '—'}</td>
                <td style={td}>{r[rowKey] ?? '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td style={td} colSpan={10}>No {label} issues yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {openId && <ErrorBoundary><IssueDrawer issueId={openId} user={user} onClose={() => setOpenId(null)} onChanged={load} onOpen={setOpenId} /></ErrorBoundary>}
    </>
  );
}
