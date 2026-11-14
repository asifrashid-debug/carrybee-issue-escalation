'use client';
import { useEffect, useState } from 'react';

export default function EscalationForm({ channel }) {
  const [masters, setMasters] = useState({ hubs: [], categories: [], users: [] });
  const [form, setForm] = useState({ email: 'kam.user@carrybee.com', consignment_id: '', merchant_name: '', zone: 'ISD', concern_hub: '', issue_category: '', issue_sub_category: '', issue_details: '', kam_name: '', priority_scale: 'P3', kam_feedback_status: 'Not Shared' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/masters').then(r=>r.json()).then(setMasters); }, []);
  const reqCats = masters.categories.filter(c=>c.side==='requester');
  const cats = [...new Set(reqCats.map(c=>c.category))];
  const subs = reqCats.filter(c=>c.category===form.issue_category).map(c=>c.sub_category);
  const hub = masters.hubs.find(h=>h.hub_name===form.concern_hub);
  const set = (k,v)=>setForm(f=>({...f,[k]:v}));
  async function submit(e) {
    e.preventDefault(); setErr(null); setMsg(null);
    if (!form.consignment_id.trim() && !form.merchant_name.trim()) { setErr('Consignment ID and Merchant Name cannot both be empty. Provide at least one.'); return; }
    if (form.issue_details.trim().length < 20) { setErr('Issue Details must be at least 20 characters.'); return; }
    setBusy(true);
    const res = await fetch('/api/escalations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, channel }) });
    const j = await res.json(); setBusy(false);
    if (!res.ok) { setErr(j.error||'Submit failed'); return; }
    setMsg({ id: j.data.issue_id, warn: j.duplicate_warning });
  }
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <h1 style={{ marginTop: 0 }}>{channel==='KAM' ? 'KAM Issue Escalation' : 'MX Issue Escalation'}</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>Channel is read-only: <b>{channel}</b>. Timestamp, Email, Week are auto-captured server-side.</p>
      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, marginBottom: 12 }}>{err}</div>}
      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        ✅ Submitted! Issue ID: <b>{msg.id}</b> — visible in tracker ≤5s, sheet push queued ≤60s.
        {msg.warn && <div style={{ marginTop: 6 }}>⚠️ {msg.warn}</div>}
        <div style={{ marginTop: 8 }}><a href="/">Go to Tracker →</a></div>
      </div>}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>Email Address (auto, SSO in prod; demo picker below)<input value={form.email} onChange={e=>set('email', e.target.value)} required style={inp} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Consignment ID<input value={form.consignment_id} onChange={e=>set('consignment_id', e.target.value)} placeholder="e.g. CB-123456" style={inp} /></label>
          <label>Merchant Name<input value={form.merchant_name} onChange={e=>set('merchant_name', e.target.value)} placeholder="Merchant" style={inp} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Zone<select value={form.zone} onChange={e=>set('zone', e.target.value)} style={inp}><option>ISD</option><option>OSD</option><option>CTG</option></select></label>
          <label>Concern Hub (dropdown only)<select value={form.concern_hub} onChange={e=>{ set('concern_hub', e.target.value); const h=masters.hubs.find(x=>x.hub_name===e.target.value); if(h) set('zone', h.zone); }} required style={inp}><option value="">Select hub…</option>{masters.hubs.map(h=><option key={h.hub_name} value={h.hub_name}>{h.hub_name} ({h.zone} • {h.division})</option>)}</select></label>
        </div>
        {hub && <div style={{ fontSize: 13, color: '#374151' }}>Auto: Regional Lead <b>{hub.regional_lead}</b> • Division <b>{hub.division}</b></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Issue Category<select value={form.issue_category} onChange={e=>set('issue_category', e.target.value)} required style={inp}><option value="">Select…</option>{cats.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Sub Category<select value={form.issue_sub_category} onChange={e=>set('issue_sub_category', e.target.value)} required style={inp}><option value="">Select…</option>{subs.map(s=><option key={s}>{s}</option>)}</select></label>
        </div>
        <label>Issue Details (min 20 chars)<textarea value={form.issue_details} onChange={e=>set('issue_details', e.target.value)} rows={4} required style={inp} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>KAM Name{channel==='KAM' ? ' (auto from user, editable)' : ' (dropdown)'}<input value={form.kam_name} onChange={e=>set('kam_name', e.target.value)} placeholder={channel==='MX' ? 'N/A — MX Direct' : 'KAM name'} style={inp} /></label>
          <label>Priority Scale<select value={form.priority_scale} onChange={e=>set('priority_scale', e.target.value)} style={inp}><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label>
        </div>
        <label>KAM Feedback Status<select value={form.kam_feedback_status} onChange={e=>set('kam_feedback_status', e.target.value)} style={inp}><option>Not Shared</option><option>Shared with Merchant</option><option>Merchant Confirmed</option><option>Merchant Disputed</option></select></label>
        <button disabled={busy} style={{ background: '#0b2a4a', color: '#fff', padding: '10px 16px', border: 0, borderRadius: 8, cursor: 'pointer' }}>{busy ? 'Submitting…' : 'Submit Escalation'}</button>
      </form>
    </div>
  );
}
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 4, boxSizing: 'border-box' };
