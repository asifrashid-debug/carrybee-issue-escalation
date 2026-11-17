'use client';
import { useVisibleInterval } from '../../components/cw/useVisibleInterval';
import { useEffect, useState } from 'react';
import { kpiStrip } from '../../components/cw/chartlib';
import { fmtN } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';

const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const ZONES = ['ISD', 'OSD', 'CTG'];
const STATUS_CLASS = { success: 'p-ok', queued: 'p-wait', sending: 'p-wait', failed: 'p-breach', dead_letter: 'p-breach' };
const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };

// Sync Health, demo layout (carrybee-complete-web.html pSync). Queue, last success, failures and recent events from sync_log.
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
  useEffect(() => { load(); }, []);
  useVisibleInterval(load, 60000);

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
    <div>
      <div className="ph">
        <div>
          <div className="kicker">Sync health · live</div>
          <h1>Sheet sync</h1>
          <p className="sub">Two-way sync between the database and the ISD, OSD and CTG zone sheets · auto-refreshes every 60 seconds</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="chip"><span className="live" aria-hidden="true" />{data ? `Live · ${fmtN(data.queue_depth)} queued` : 'Live'}</span>
          <button type="button" className="btn" onClick={load} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="box box-bad" role="alert" style={{ marginBottom: 12 }}><b>Could not load sync status.</b> {error}</div>}
      {msg && <div className={`box box-${msg.tone}`} role="status" style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h"><div><h2>Two-way Google Sheets sync &amp; reconciliation</h2><small>Each write is keyed on the immutable Issue ID (column A) and logged in the sync log. Reconciliation compares a zone sheet with the database and repairs drift.</small></div></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="btn" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)} style={{ padding: '8px 12px' }}>
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
          <button type="button" className="btn bee" onClick={reconcile} disabled={busy}>{busy ? 'Running…' : 'Run reconcile'}</button>
        </div>
      </div>

      {data && (
        <Html html={kpiStrip([
          { label: 'Queue depth', value: fmtN(data.queue_depth), sub: 'Queued or sending sync jobs', icon: 'sync', good: !data.queue_depth },
          { label: 'Last successful sync', value: data.last_success ? formatDhaka(data.last_success.created_at) : 'None yet', sub: 'Most recent successful write', icon: 'resolved' },
          { label: 'Failures in last 100 events', value: fmtN(failed), sub: `${fmtN(succeeded)} succeeded · ${fmtN(queued)} in flight`, icon: 'breach', good: !failed },
        ])} />
      )}

      {data && (
        <div className="card mt" style={{ padding: '12px 8px 8px' }}>
          <div className="card-h" style={{ padding: '0 12px' }}><div><h2>Sources</h2><small>Status per zone sheet · from the last 100 sync events</small></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Zone sheet</th><th>Last event (Dhaka)</th><th>Last success</th><th>Failures (100)</th><th>Status</th></tr></thead>
              <tbody>
                {ZONES.map((z) => {
                  const rows = recent.filter((r) => r.zone === z);
                  const last = rows[0];
                  const okRow = rows.find((r) => r.status === 'success');
                  const fails = rows.filter((r) => r.status === 'failed' || r.status === 'dead_letter').length;
                  const st = !last ? ['No events', 'p-res'] : last.status === 'success' ? ['In sync', 'p-ok'] : fails ? ['Failed · retrying', 'p-breach'] : ['In flight', 'p-wait'];
                  return (
                    <tr key={z}>
                      <td><span className="zc" style={{ borderColor: ZONE_COLOR[z] }}>{z}</span> <b>{z} hub sheet</b></td>
                      <td className="mono">{last ? formatDhaka(last.created_at) : '—'}</td>
                      <td className="mono">{okRow ? formatDhaka(okRow.created_at) : '—'}</td>
                      <td className="mono">{fmtN(fails)}</td>
                      <td><span className={`pill ${st[1]}`}>{st[0]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card mt" style={{ padding: '12px 8px 8px' }}>
        <div className="card-h" style={{ padding: '0 12px' }}><div><h2>Recent sync events</h2><small>Last 100 · newest first</small></div></div>
        {recent.length === 0 && !loading ? <div className="empty">No sync events yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>When (Dhaka)</th><th>Direction</th><th>Issue</th><th>Zone</th><th>Status</th><th>Retries</th><th>Error</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{formatDhaka(r.created_at)}</td>
                    <td>{r.direction}</td>
                    <td><span className="mono">{r.issue_id || '—'}</span></td>
                    <td>{r.zone ? <span className="zc">{r.zone}</span> : '—'}</td>
                    <td><span className={`pill ${STATUS_CLASS[r.status] || 'p-res'}`}>{r.status}</span></td>
                    <td>{r.retries ?? 0}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 360 }}>{r.error_message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="note">Only admins can run reconciliation. The 15-minute automatic job runs once sheet sync is connected.</p>
    </div>
  );
}
