'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatDhaka } from '../lib/time';
import { IR_KAM_STATUSES } from '../lib/irKamStatus.mjs';

// IR Issues tab: every escalation the KAM ticked for IR (route_ir), with the IR pick and resolve SLA.
// Click a row to open the drawer. The KAM (raiser), their team lead or an admin sets the KAM Status there.
// Data: GET /api/escalations?route=ir. Visibility follows the same scope rules as the tracker.
const SLA_STYLE = { 'Within SLA': 'var(--good)', Breached: 'var(--bad, #c0392b)', Pending: 'var(--mut)', 'No SLA set': 'var(--mut)' };

export default function IrIssues() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); // issue_id of the open drawer

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
  const current = rows.find((r) => r.issue_id === sel) || null;

  // Replace one row after a save, so the table and the drawer show the stored value.
  function onSaved(updated) {
    setRows((list) => list.map((r) => (r.issue_id === updated.issue_id ? { ...r, ...updated } : r)));
  }

  return (
    <>
      <div className="ph">
        <div>
          <div className="kicker">IR</div>
          <h1>IR Issues</h1>
          <p className="sub">Issues the KAM sent to IR. Click an issue to open it and set the KAM Status. Pick and resolve times come from the IR sheet and the SLA targets.</p>
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
              <tr key={r.issue_id} onClick={() => setSel(r.issue_id)} style={{ cursor: 'pointer', background: sel === r.issue_id ? 'var(--hover, rgba(0,0,0,.04))' : undefined }}>
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
                <td style={td} onClick={(e) => e.stopPropagation()}>{r.drive_link ? <a href={r.drive_link} target="_blank" rel="noreferrer">Open zip</a> : '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td style={td} colSpan={12}>No IR issues yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {current && <IrDrawer key={current.issue_id} issue={current} onClose={() => setSel(null)} onSaved={onSaved} />}
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children || '—'}</div>
    </div>
  );
}

// Side drawer for one IR issue. The server checks who may change the KAM Status (raiser, team lead, admin).
function IrDrawer({ issue: d, onClose, onSaved }) {
  const [status, setStatus] = useState(d.ir_kam_status || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [mail, setMail] = useState({ state: 'loading', messages: [], note: null, error: null });

  // Mails with this issue's subject line, from the mailbox (read-only).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ir/${encodeURIComponent(d.issue_id)}/mail`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) setMail({ state: 'error', messages: [], note: null, error: j.error || 'Could not load the mail.' });
        else setMail({ state: 'done', messages: j.messages || [], note: j.note || null, error: null });
      })
      .catch(() => { if (!cancelled) setMail({ state: 'error', messages: [], note: null, error: 'Could not load the mail.' }); });
    return () => { cancelled = true; };
  }, [d.issue_id]);

  async function save() {
    setErr(null); setMsg(null);
    if (!status) { setErr('Choose a KAM Status.'); return; }
    setBusy(true);
    const res = await fetch(`/api/ir/${encodeURIComponent(d.issue_id)}/kam-status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setErr(j.error || 'Could not save the KAM Status. Try again.'); return; }
    setMsg('KAM Status saved.');
    onSaved({ issue_id: d.issue_id, ir_kam_status: status });
  }

  const sectionTitle = { fontSize: 13, fontWeight: 700, margin: '18px 0 8px', color: 'var(--ink, #222)' };
  return (
    <div role="dialog" aria-modal="false" aria-label={`IR issue ${d.issue_id}`} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 100vw)', background: 'var(--card, #fff)', boxShadow: '-8px 0 24px rgba(0,0,0,.18)', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line, #eee)' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--mut)' }}>IR issue</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{d.issue_id}</div>
        </div>
        <button type="button" className="ibtn" onClick={onClose} aria-label="Close">Close</button>
      </div>
      <div style={{ padding: '4px 20px', overflowY: 'auto', flex: 1 }}>
        <div style={sectionTitle}>Issue</div>
        <Field label="Raised (Dhaka)">{formatDhaka(d.submitted_at)}</Field>
        <Field label="HUB · Zone">{[d.concern_hub, d.zone].filter(Boolean).join(' · ')}</Field>
        <Field label="Category">{[d.issue_category, d.issue_sub_category].filter(Boolean).join(' › ')}</Field>
        <Field label="Mail subject">{d.mail_subject}</Field>
        <Field label="Issue details">{d.issue_details}</Field>
        <Field label="Attachment">{d.drive_link ? <a href={d.drive_link} target="_blank" rel="noreferrer">Open zip</a> : null}</Field>

        <div style={sectionTitle}>IR progress</div>
        <Field label="Assigned IR member">{d.ir_assigned_member}</Field>
        <Field label="IR Status">{d.ir_status || 'Open'}</Field>
        <Field label="Feedback from IR">{d.ir_feedback}</Field>
        <Field label="Feedback from IR lead">{d.ir_lead_feedback}</Field>
        <Field label="IR Pick SLA">{d.ir_pick_sla}</Field>
        <Field label="IR Resolve SLA">{d.ir_resolve_sla}</Field>

        <div style={sectionTitle}>Mail</div>
        {!d.mail_subject && <div className="hint">No mail subject line was entered for this issue.</div>}
        {d.mail_subject && (
          <div className="hint" style={{ marginBottom: 8 }}>Subject: <b>{d.mail_subject}</b></div>
        )}
        {mail.state === 'loading' && d.mail_subject && <div className="hint">Loading mail…</div>}
        {mail.error && <div className="err on" role="alert">{mail.error}</div>}
        {mail.note && mail.state === 'done' && <div className="hint">{mail.note}</div>}
        {mail.messages.map((m) => (
          <div key={m.id} style={{ border: '1px solid var(--line, #e5e5e5)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--mut)' }}>{m.date ? formatDhaka(m.date) : ''}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}><b>From:</b> {m.from || '—'}</div>
            <div style={{ fontSize: 13 }}><b>To:</b> {m.to || '—'}</div>
            {m.cc && <div style={{ fontSize: 13 }}><b>Cc:</b> {m.cc}</div>}
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
              {m.body || '(no text body)'}
            </div>
            {m.body_truncated && <div className="hint">Shown in part. The full mail is in Gmail.</div>}
            {m.attachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 4 }}>Attachments</div>
                {m.attachments.map((a) => (
                  <div key={a.attachmentId} style={{ fontSize: 13, marginBottom: 2 }}>
                    <a href={`/api/ir/${encodeURIComponent(d.issue_id)}/mail/attachment?message=${encodeURIComponent(m.id)}&attachment=${encodeURIComponent(a.attachmentId)}`} download>{a.filename}</a>
                    {a.size ? <span className="hint"> · {Math.round(a.size / 1024)} KB</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={sectionTitle}>KAM feedback</div>
        <label htmlFor="ir-kam-status" style={{ display: 'block', fontSize: 12, color: 'var(--mut)', marginBottom: 4 }}>KAM Status</label>
        <select id="ir-kam-status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy} style={{ width: '100%', padding: '8px 10px', fontSize: 14 }}>
          <option value="">Choose a status…</option>
          {IR_KAM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button type="button" className="submit" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save KAM Status'}</button>
          {msg && <span role="status" style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</span>}
        </div>
        {err && <div className="err on" role="alert" style={{ marginTop: 12 }}>{err}</div>}
        <p className="hint" style={{ marginTop: 14 }}>Only the KAM who raised this issue, their team lead or an admin can change this. The value also updates the IR sheet.</p>
      </div>
    </div>
  );
}
