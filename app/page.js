'use client';
import { useEffect, useState } from 'react';
import { formatDhaka, hoursSince } from '../lib/time';

const VIEWS = [
  { id: '', label: 'All Issues' }, { id: 'mine', label: 'My Escalations' }, { id: 'unpicked', label: 'Unpicked' },
  { id: 'awaiting', label: 'Awaiting First Response' }, { id: 'resolved_week', label: 'Resolved This Week' },
  { id: 'ISD', label: 'ISD Queue' }, { id: 'OSD', label: 'OSD Queue' }, { id: 'CTG', label: 'CTG Queue' }
];

export default function Tracker() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('');
  const [f, setF] = useState({ zone: '', channel: '', issue_status: '', ops_issue_status: '', ops_status: '', validation: '', priority_scale: '', week: '', search: '', mine: '' });
  const [user, setUser] = useState({ email: 'asif.rashid@carrybee.com', role: 'admin' });
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState([]);
  const [sla, setSla] = useState({ pick_hours: 4, first_response_hours: 24, resolution_hours: 72 });
  const [msg, setMsg] = useState('');

  async function load() {
    const p = new URLSearchParams({ page, pageSize: '25', ...Object.fromEntries(Object.entries(f).filter(([,v])=>v)) });
    if (view === 'mine') p.set('mine', user.email);
    else if (view === 'unpicked' || view === 'awaiting' || view === 'resolved_week') p.set('view', view);
    else if (['ISD','OSD','CTG'].includes(view)) p.set('zone', view);
    const r = await fetch('/api/escalations?' + p.toString());
    const j = await r.json();
    setRows(j.data||[]); setCount(j.count||0);
  }
  useEffect(()=>{ load(); }, [page, view, f]);
  useEffect(()=>{ fetch('/api/masters').then(r=>r.json()).then(j=>{ setUsers(j.users||[]); const c=j.config?.find(x=>x.key==='sla'); if(c) setSla(c.value); }); }, []);
  useEffect(()=>{ const t=setInterval(load, 30000); return ()=>clearInterval(t); }, [page, view, f, user]);

  async function openDetail(id) {
    const r = await fetch(`/api/escalations/${id}`); const j = await r.json();
    setSelected(j.data); setAudit(j.audit||[]);
  }
  async function pick(id) {
    const r = await fetch(`/api/escalations/${id}/pick`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ actor_email: user.email }) });
    const j = await r.json(); setMsg(r.ok ? `Picked ${id} at ${formatDhaka(j.data.issue_pick_time)}` : j.error); load(); if(selected) openDetail(id);
  }
  async function patch(id, body) {
    const r = await fetch(`/api/escalations/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ...body, actor_email: user.email, actor_role: user.role }) });
    const j = await r.json(); setMsg(r.ok ? 'Saved & queued to sheet ≤60s' : j.error); load(); if(selected) openDetail(id);
  }
  function slaFlags(e) {
    const flags = [];
    const sinceSubmit = hoursSince(e.submitted_at);
    if (!e.issue_pick_time && sinceSubmit > sla.pick_hours) flags.push(`⚠️ Pick breach (${sinceSubmit.toFixed(1)}h)`);
    if (!e.issue_response_datetime && sinceSubmit > sla.first_response_hours) flags.push(`⚠️ No response (${sinceSubmit.toFixed(1)}h)`);
    if (e.issue_response_datetime && e.ops_issue_status !== 'Resolved' && hoursSince(e.issue_response_datetime) > sla.resolution_hours) flags.push('⚠️ Resolution overdue');
    return flags;
  }
  const tiles = {
    open: rows.filter(r=>r.issue_status!=='Closed').length,
    unpicked: rows.filter(r=>!r.issue_pick_time).length,
    awaiting: rows.filter(r=>!r.issue_response_datetime).length,
    resolvedWeek: rows.filter(r=>r.ops_issue_status==='Resolved').length
  };
  const setF2 = (k,v)=>setF(s=>({...s,[k]:v}));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Tracker</h1>
        <label style={{ fontSize: 13 }}>Acting as (demo RBAC): <select value={user.email} onChange={e=>{ const u=users.find(x=>x.email===e.target.value); setUser({ email: u.email, role: u.role }); }} style={{ padding: 6, borderRadius: 6 }}>
          {users.map(u=><option key={u.email} value={u.email}>{u.email} ({u.role})</option>)}
        </select></label>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Role: <b>{user.role}</b> • Polls every 30s • {count} total</span>
        <a href="/api/export" style={{ marginLeft: 'auto', fontSize: 13 }}>Export CSV (filtered)</a>
      </div>
      {msg && <div style={{ background: '#eff6ff', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 14 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
        <Tile label="Open (page)" v={tiles.open} /><Tile label="Unpicked" v={tiles.unpicked} /><Tile label="Awaiting Response" v={tiles.awaiting} /><Tile label="Resolved (page)" v={tiles.resolvedWeek} />
      </div>
      <div style={{ background: '#fff', padding: 12, borderRadius: 12, marginBottom: 12, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {VIEWS.map(v=><button key={v.id} onClick={()=>{ setView(v.id); setPage(1); }} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: view===v.id ? '#0b2a4a' : '#fff', color: view===v.id ? '#fff' : '#111' }}>{v.label}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
          <Sel label="Zone" v={f.zone} onChange={v=>setF2('zone',v)} opts={['','ISD','OSD','CTG']} />
          <Sel label="Channel" v={f.channel} onChange={v=>setF2('channel',v)} opts={['','KAM','MX']} />
          <Sel label="Issue Status" v={f.issue_status} onChange={v=>setF2('issue_status',v)} opts={['','Open','Reopened','Closed']} />
          <Sel label="ISSUE STATUS (Ops)" v={f.ops_issue_status} onChange={v=>setF2('ops_issue_status',v)} opts={['','New','Picked','In Progress','On Hold','Resolved','Unresolved']} />
          <Sel label="Ops Status" v={f.ops_status} onChange={v=>setF2('ops_status',v)} opts={['','Pending','In Progress','Completed','Dropped']} />
          <Sel label="Validation" v={f.validation} onChange={v=>setF2('validation',v)} opts={['','Valid','Invalid','Duplicate','Insufficient Info']} />
          <Sel label="Priority" v={f.priority_scale} onChange={v=>setF2('priority_scale',v)} opts={['','P1','P2','P3','P4']} />
          <label style={{ fontSize: 12 }}>Search (ID / Consignment / Merchant)<input value={f.search} onChange={e=>setF2('search', e.target.value)} style={inp} /></label>
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 1100 }}>
          <thead><tr style={{ background: '#0b2a4a', color: '#fff' }}>
            {['Issue ID','Timestamp (Dhaka)','Consignment / Merchant','Channel','Zone / Hub','Category','Priority','Issue Status','ISSUE STATUS','Ops Status','Pick Time','Response','SLA','Actions'].map(h=><th key={h} style={{ padding: 8, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(e=>(
              <tr key={e.issue_id} style={{ borderTop: '1px solid #e5e7eb', background: e.priority_scale==='P1' ? '#fef2f2' : '#fff' }}>
                <td style={{ padding: 8 }}><button onClick={()=>openDetail(e.issue_id)} style={{ color: '#0b2a4a', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer' }}>{e.issue_id}</button></td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{formatDhaka(e.submitted_at)}</td>
                <td style={{ padding: 8 }}>{e.consignment_id||'—'}<br/><span style={{ color: '#6b7280' }}>{e.merchant_name||''}</span></td>
                <td style={{ padding: 8 }}>{e.channel}</td>
                <td style={{ padding: 8 }}>{e.zone}<br/><span style={{ color: '#6b7280' }}>{e.concern_hub}</span></td>
                <td style={{ padding: 8 }}>{e.issue_category}<br/><span style={{ color: '#6b7280' }}>{e.issue_sub_category}</span></td>
                <td style={{ padding: 8 }}><span style={{ background: e.priority_scale==='P1' ? '#dc2626' : '#e5e7eb', color: e.priority_scale==='P1' ? '#fff' : '#111', padding: '2px 8px', borderRadius: 999 }}>{e.priority_scale}</span></td>
                <td style={{ padding: 8 }}>{e.issue_status}</td>
                <td style={{ padding: 8 }}>{e.ops_issue_status}</td>
                <td style={{ padding: 8 }}>{e.ops_status}</td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{e.issue_pick_time ? formatDhaka(e.issue_pick_time) : '—'}</td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{e.issue_response_datetime ? formatDhaka(e.issue_response_datetime) : '—'}</td>
                <td style={{ padding: 8 }}>{slaFlags(e).join(' ')||'—'}</td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  {!e.issue_pick_time && <button onClick={()=>pick(e.issue_id)} style={btn}>Pick</button>}
                  <button onClick={()=>openDetail(e.issue_id)} style={{ ...btn, marginLeft: 6 }}>Details</button>
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={14} style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No issues. Submit via KAM/MX form.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} style={btn}>← Prev</button>
        <span style={{ fontSize: 13 }}>Page {page} • {count} records</span>
        <button onClick={()=>setPage(p=>p+1)} style={btn}>Next →</button>
      </div>
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div style={{ background: '#fff', width: 'min(560px, 95vw)', height: '100%', overflow: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{selected.issue_id}</h2>
              <button onClick={()=>setSelected(null)} style={btn}>Close ✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280' }}>Submitted {formatDhaka(selected.submitted_at)} • Week {selected.week} • {selected.channel} • {selected.zone}</p>
            <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <Row k="Consignment / Merchant" v={`${selected.consignment_id||''} / ${selected.merchant_name||''}`} />
              <Row k="Hub / Lead / Division" v={`${selected.concern_hub} / ${selected.regional_lead||''} / ${selected.division||''}`} />
              <Row k="Category" v={`${selected.issue_category} → ${selected.issue_sub_category}`} />
              <Row k="Details" v={selected.issue_details} />
              <Row k="KAM Name / Priority" v={`${selected.kam_name||''} / ${selected.priority_scale}`} />
              <Row k="Issue Status / KAM Feedback" v={`${selected.issue_status} / ${selected.kam_feedback_status}`} />
              <Row k="Pick Time" v={selected.issue_pick_time ? formatDhaka(selected.issue_pick_time) : '—'} />
              <Row k="Response Stamp" v={selected.issue_response_datetime ? formatDhaka(selected.issue_response_datetime) : '—'} />
              <Row k="Aging" v={`Since submit: ${hoursSince(selected.submitted_at)?.toFixed(1)}h${selected.issue_pick_time ? ` • Since pick: ${hoursSince(selected.issue_pick_time)?.toFixed(1)}h` : ''}`} />
            </div>
            <h3>Ops editing (syncs to sheet)</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Comments 1<textarea defaultValue={selected.comments_1||''} id="c1" rows={2} style={inp} /></label>
              <label>Comments 2<textarea defaultValue={selected.comments_2||''} id="c2" rows={2} style={inp} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Sel2 label="ISSUE STATUS" id="ois" val={selected.ops_issue_status} opts={['New','Picked','In Progress','On Hold','Resolved','Unresolved']} />
                <Sel2 label="Ops Status" id="os" val={selected.ops_status} opts={['Pending','In Progress','Completed','Dropped']} />
                <Sel2 label="Validation" id="val" val={selected.validation||''} opts={['','Valid','Invalid','Duplicate','Insufficient Info']} />
                <Sel2 label="KAM Feedback" id="kf" val={selected.kam_feedback_status} opts={['Not Shared','Shared with Merchant','Merchant Confirmed','Merchant Disputed']} />
              </div>
              <label>Remarks<textarea defaultValue={selected.remarks||''} id="rem" rows={2} style={inp} /></label>
              <button onClick={()=>patch(selected.issue_id, { comments_1: document.getElementById('c1').value, comments_2: document.getElementById('c2').value, ops_issue_status: document.getElementById('ois').value, ops_status: document.getElementById('os').value, validation: document.getElementById('val').value||null, kam_feedback_status: document.getElementById('kf').value, remarks: document.getElementById('rem').value })} style={{ ...btn, background: '#0b2a4a', color: '#fff' }}>Save Ops Block</button>
            </div>
            <h3>Change history (audit)</h3>
            <ul style={{ fontSize: 12, color: '#374151' }}>{audit.map(a=><li key={a.id}>{formatDhaka(a.created_at)} • {a.actor_email} via {a.source}: {a.field_name} {a.old_value||'∅'} → {a.new_value||'∅'}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
function Tile({ label, v }) { return <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}><div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div></div>; }
function Sel({ label, v, onChange, opts }) { return <label style={{ fontSize: 12 }}>{label}<select value={v} onChange={e=>onChange(e.target.value)} style={inp}>{opts.map(o=><option key={o} value={o}>{o||'All'}</option>)}</select></label>; }
function Sel2({ label, id, val, opts }) { return <label style={{ fontSize: 12 }}>{label}<select id={id} defaultValue={val} style={inp}>{opts.map(o=><option key={o} value={o}>{o||'—'}</option>)}</select></label>; }
function Row({ k, v }) { return <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}><span style={{ color: '#6b7280' }}>{k}</span><span>{v}</span></div>; }
const inp = { width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 4, boxSizing: 'border-box' };
const btn = { padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 };
