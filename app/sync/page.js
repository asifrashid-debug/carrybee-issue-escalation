'use client';
import { useEffect, useState } from 'react';
import { LiveChip, PageHead, Zc, fmtN } from '../../components/demo';
import { formatDhaka } from '../../lib/time';

const ZONES = ['ISD', 'OSD', 'CTG'];
const STATUS_CLASS = { success: 'p-ok', queued: 'p-open', sending: 'p-open', failed: 'p-br', dead_letter: 'p-br' };

// Sync Health (demo layout): queue, last success, failures and recent events from sync_log.
// Auto-refreshes every 60s. Reconciliation is admin-only (the API enforces it).
export default function SyncHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState('ISD');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/sync/health', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j); setError(null);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  async function reconcile() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/sync/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Reconcile failed (${r.status})`);
      setMsg({ tone: 'ok', text: `Reconciled ${zone}: checked ${j.checked}, repaired ${j.repaired}, re-appended ${j.reappended}.` });
      load();
    } catch (e) { setMsg({ tone: 'bad', text: String(e.message || e) }); }
    finally { setBusy(false); }
  }

  const recent = data?.recent || [];
  const succeeded = recent.filter((r) => r.status === 'success').length;
  const queued = recent.filter((r) => r.status === 'queued' || r.status === 'sending').length;
  const failed = recent.filter((r) => r.status === 'failed' || r.status === 'dead_letter').length;

  return (
    <div className="dm">
      <PageHead kicker="Sync health · live" title="Sheet sync" sub="Two-way sync between the database and the ISD, OSD and CTG zone sheets · auto-refreshes every 60 seconds">
        <LiveChip label={data ? `Live · ${fmtN(data.queue_depth)} queued` : 'Live'} />
        <button type="button" className="btn" onClick={load} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
      </PageHead>

      {error && <div className="box box-bad" role="alert"><b>Could not load sync status.</b> {error}</div>}
      {msg && <div className={`box box-${msg.tone}`} role="status">{msg.text}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="sync-h">
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Two-Way Google Sheets Sync &amp; Reconciliation</h3>
            <div className="ks">Each write is keyed on the immutable Issue ID (column A) and logged in the sync log. Reconciliation compares a zone sheet with the database and repairs drift.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="btn" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)} style={{ padding: '8px 12px' }}>
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
          <button type="button" className="btn y" onClick={reconcile} disabled={busy}>{busy ? 'Running…' : 'Run reconcile'}</button>
        </div>
      </div>

      {data && (
        <div className="grid g3 kpi-strip">
          <div className="card">
            <div className="kl">Queue depth</div>
            <div className={`kv ${data.queue_depth ? '' : ''}`} style={{ color: data.queue_depth ? 'var(--warn)' : 'var(--good)' }}>{fmtN(data.queue_depth)}</div>
            <div className="ks">Queued or sending sync jobs</div>
          </div>
          <div className="card">
            <div className="kl">Last successful sync</div>
            <div className="kv" style={{ fontSize: 20, marginTop: 14 }}>{data.last_success ? formatDhaka(data.last_success.created_at) : 'None yet'}</div>
            <div className="ks">Most recent successful write</div>
          </div>
          <div className={`card ${failed ? 'hot' : ''}`}>
            <div className="kl">Failures in last 100 events</div>
            <div className="kv" style={{ color: failed ? 'var(--bad)' : 'var(--good)' }}>{fmtN(failed)}</div>
            <div className="ks">{fmtN(succeeded)} succeeded · {fmtN(queued)} in flight</div>
          </div>
        </div>
      )}

      {data && (
        <div className="card" style={{ padding: 0, marginBottom: 14 }}>
          <div className="ph" style={{ padding: '14px 16px', margin: 0 }}>
            <div><h3 style={{ fontSize: 14 }}>Sources</h3><small>Status per zone sheet · from the last 100 sync events</small></div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Zone sheet</th><th>Last event (Dhaka)</th><th>Last success</th><th>Failures (100)</th><th>Status</th></tr></thead>
              <tbody>
                {ZONES.map((z) => {
                  const rows = recent.filter((r) => r.zone === z);
                  const last = rows[0];
                  const okRow = rows.find((r) => r.status === 'success');
                  const fails = rows.filter((r) => r.status === 'failed' || r.status === 'dead_letter').length;
                  const st = !last ? ['No events', 'p-reg'] : last.status === 'success' ? ['In sync', 'p-ok'] : fails ? ['Failed · retrying', 'p-br'] : ['In flight', 'p-open'];
                  return (
                    <tr key={z}>
                      <td data-label="Zone sheet"><Zc z={z} /> <b>{z} hub sheet</b></td>
                      <td data-label="Last event" className="mono">{last ? formatDhaka(last.created_at) : '—'}</td>
                      <td data-label="Last success" className="mono">{okRow ? formatDhaka(okRow.created_at) : '—'}</td>
                      <td data-label="Failures" className="mono">{fmtN(fails)}</td>
                      <td data-label="Status"><span className={`pillc ${st[1]}`}>{st[0]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="ph" style={{ padding: '14px 16px', margin: 0 }}>
          <div><h3 style={{ fontSize: 14 }}>Recent sync events</h3><small>Last 100 · newest first</small></div>
        </div>
        {recent.length === 0 && !loading ? <div className="empty">No sync events yet.</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>When (Dhaka)</th><th>Direction</th><th>Issue</th><th>Zone</th><th>Status</th><th>Retries</th><th>Error</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{formatDhaka(r.created_at)}</td>
                    <td>{r.direction}</td>
                    <td><span className="idc">{r.issue_id || '—'}</span></td>
                    <td>{r.zone ? <Zc z={r.zone} /> : '—'}</td>
                    <td><span className={`pillc ${STATUS_CLASS[r.status] || 'p-reg'}`}>{r.status}</span></td>
                    <td>{r.retries ?? 0}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 360 }}>{r.error_message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="note2">Only admins can run reconciliation. The 15-minute automatic job runs once sheet sync is connected.</p>
    </div>
  );
}
