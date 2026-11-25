'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatDhaka } from '../lib/time';

// IR Issues tab: every escalation the KAM ticked for IR (route_ir), with the IR pick and resolve SLA.
// Data: GET /api/escalations?route=ir. Visibility follows the same scope rules as the tracker.
const SLA_STYLE = { 'Within SLA': 'var(--good)', Breached: 'var(--bad, #c0392b)', Pending: 'var(--mut)', 'No SLA set': 'var(--mut)' };

export default function IrIssues() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/escalations?route=ir&pageSize=100', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Could not load IR issues');
        setRows(j.data || []); setCount(j.count ?? (j.data || []).length); setErr(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--mut)', borderBottom: '1px solid var(--line, #ddd)', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--line, #eee)', verticalAlign: 'top' };

  return (
    <>
      <div className="ph">
        <div>
          <div className="kicker">IR</div>
          <h1>IR Issues</h1>
          <p className="sub">Issues the KAM sent to IR. Pick and resolve times come from the IR sheet and the SLA targets.</p>
        </div>
        <button type="button" className="ibtn" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {err && <div className="err on" role="alert" style={{ margin: '12px 24px' }}>{err}</div>}
      <div style={{ padding: '12px 24px', overflowX: 'auto' }}>
        <div className="hint" style={{ marginBottom: 8 }}>{count} IR issue{count === 1 ? '' : 's'}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Issue ID</th><th style={th}>Raised (Dhaka)</th><th style={th}>HUB</th><th style={th}>Zone</th>
              <th style={th}>Category</th><th style={th}>Mail subject</th><th style={th}>Status from KAM</th>
              <th style={th}>Assigned IR member</th><th style={th}>IR Status</th><th style={th}>IR Pick SLA</th>
              <th style={th}>IR Resolve SLA</th><th style={th}>Attachment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.issue_id}>
                <td style={td}><b>{r.issue_id}</b></td>
                <td style={td}>{formatDhaka(r.submitted_at)}</td>
                <td style={td}>{r.concern_hub}</td>
                <td style={td}>{r.zone}</td>
                <td style={td}>{r.issue_category}<br /><small>{r.issue_sub_category}</small></td>
                <td style={td}>{r.mail_subject || '—'}</td>
                <td style={td}>{r.ir_kam_status || '—'}</td>
                <td style={td}>{r.ir_assigned_member || '—'}</td>
                <td style={td}>{r.ir_status || 'Open'}</td>
                <td style={{ ...td, color: SLA_STYLE[r.ir_pick_sla] || 'inherit', fontWeight: 600 }}>{r.ir_pick_sla || '—'}</td>
                <td style={{ ...td, color: SLA_STYLE[r.ir_resolve_sla] || 'inherit', fontWeight: 600 }}>{r.ir_resolve_sla || '—'}</td>
                <td style={td}>{r.drive_link ? <a href={r.drive_link} target="_blank" rel="noreferrer">Open zip</a> : '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td style={td} colSpan={12}>No IR issues yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
