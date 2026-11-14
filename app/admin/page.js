'use client';
import { useEffect, useState } from 'react';
export default function Admin() {
  const [health, setHealth] = useState(null);
  const [masters, setMasters] = useState({ hubs: [], categories: [], users: [], config: [] });
  const [zone, setZone] = useState('ISD');
  const [msg, setMsg] = useState('');
  async function load() { const r = await fetch('/api/sync/health'); setHealth(await r.json()); const m = await fetch('/api/masters'); setMasters(await m.json()); }
  useEffect(()=>{ load(); }, []);
  async function reconcile() { const r = await fetch('/api/sync/reconcile', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ zone }) }); const j = await r.json(); setMsg(r.ok ? `Reconciled ${zone}: checked ${j.checked}, repaired ${j.repaired}, re-appended ${j.reappended}` : j.error); load(); }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Admin — Masters & Sync Health</h1>
      {msg && <div style={{ background: '#eff6ff', padding: 10, borderRadius: 8 }}>{msg}</div>}
      <section style={{ background: '#fff', padding: 16, borderRadius: 12 }}>
        <h2>Sync Health</h2>
        <p style={{ fontSize: 14 }}>Queue depth (queued/failed): <b>{health?.queue_depth ?? '…'}</b> • Last success: {health?.last_success ? `${health.last_success.issue_id||''} ${new Date(health.last_success.created_at).toLocaleString()}` : '—'}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={zone} onChange={e=>setZone(e.target.value)} style={{ padding: 8, borderRadius: 8 }}><option>ISD</option><option>OSD</option><option>CTG</option></select>
          <button onClick={reconcile} style={{ padding: '8px 12px', borderRadius: 8, background: '#0b2a4a', color: '#fff', border: 0 }}>Run Reconciliation (15-min job)</button>
          <button onClick={load} style={{ padding: '8px 12px', borderRadius: 8 }}>Refresh</button>
        </div>
        <ul style={{ fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{(health?.recent||[]).slice(0,20).map(l=><li key={l.id}>{new Date(l.created_at).toLocaleString()} • {l.direction} • {l.issue_id||''} • {l.status} {l.error_message?`— ${l.error_message}`:''}</li>)}</ul>
      </section>
      <section style={{ background: '#fff', padding: 16, borderRadius: 12 }}>
        <h2>Hub Master ({masters.hubs.length})</h2>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}><thead><tr><th align="left">Hub</th><th align="left">Zone</th><th align="left">Division</th><th align="left">Regional Lead</th></tr></thead><tbody>{masters.hubs.map(h=><tr key={h.hub_name}><td>{h.hub_name}</td><td>{h.zone}</td><td>{h.division}</td><td>{h.regional_lead}</td></tr>)}</tbody></table>
      </section>
      <section style={{ background: '#fff', padding: 16, borderRadius: 12 }}>
        <h2>App Config (SLA, sheets, validation)</h2>
        <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(masters.config, null, 2)}</pre>
        <p style={{ fontSize: 12, color: '#6b7280' }}>Edit via Supabase app_config table. SLA defaults: pick ≤4h, first response ≤24h, resolution ≤72h. Consignment regex configurable (TBC).</p>
      </section>
      <section style={{ background: '#fff', padding: 16, borderRadius: 12 }}>
        <h2>Zone Change (Admin only, audited)</h2>
        <p style={{ fontSize: 13 }}>Use tracker detail → PATCH with actor_role=admin + new zone. Old sheet row is marked MOVED and new row appended with same Issue ID (see README runbook).</p>
      </section>
    </div>
  );
}
