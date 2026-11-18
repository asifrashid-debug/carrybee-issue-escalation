'use client';
import { useEffect, useState } from 'react';

// Super admin only. Shows the draft report first; nothing is sent until the admin confirms.
export default function SendReportButton() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((me) => setIsAdmin(me?.role === 'admin')).catch(() => {});
  }, []);

  async function openDraft() {
    setOpen(true); setDraft(null); setErr(null); setResult(null); setLoading(true);
    try {
      const r = await fetch('/api/report/draft', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDraft(j);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  async function send() {
    if (sending || !draft) return;
    setSending(true); setErr(null);
    try {
      const r = await fetch('/api/report/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, asOf: draft.asOf }) });
      const j = await r.json();
      if (!r.ok && r.status !== 207) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
    } catch (e) { setErr(e.message); } finally { setSending(false); }
  }

  if (!isAdmin) return null;
  const close = () => { if (!sending) setOpen(false); };

  return (
    <>
      <button type="button" className="btn-primary" onClick={openDraft}>Send report</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="send-report-title"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface, #fff)', color: 'var(--text, #1f2933)', borderRadius: 10, maxWidth: 900, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(128,128,128,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="send-report-title" style={{ margin: 0, fontSize: 17 }}>Draft report</h2>
              <button type="button" className="btn" onClick={close} disabled={sending} aria-label="Close draft">Close</button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              {loading && <div className="empty">Building the draft…</div>}
              {err && <div className="box box-bad" role="alert">{err}</div>}
              {result && (
                <div className={`box ${result.failed?.length ? 'box-warn' : 'box-ok'}`} role="status">
                  <b>Sent to {result.sent} of {result.total}.</b>
                  {result.failed?.length > 0 && <ul>{result.failed.map((f) => <li key={f.to}>{f.to}: {f.error}</li>)}</ul>}
                </div>
              )}
              {draft && !result && (
                <>
                  <p style={{ margin: '0 0 6px' }}><b>Subject:</b> {draft.subject}</p>
                  <p style={{ margin: '0 0 12px', fontSize: 13 }}><b>Will be sent to {draft.recipients.length} people:</b> {draft.recipients.map((r) => (r.scope === 'all' ? `${r.name} (all teams)` : `${r.name} (${(r.teams || []).join(', ')})`)).join('; ')}</p>
                  <p style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.7 }}>Preview shows your copy, with all teams. Each team lead receives only their own team.</p>
                  <iframe title="Draft email preview" srcDoc={draft.html} sandbox="" style={{ width: '100%', height: 520, border: '1px solid rgba(128,128,128,0.3)', borderRadius: 6, background: '#fff' }} />
                </>
              )}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(128,128,128,0.25)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {result ? (
                <button type="button" className="btn-primary" onClick={close}>Done</button>
              ) : (
                <>
                  <button type="button" className="btn" onClick={close} disabled={sending}>Cancel</button>
                  <button type="button" className="btn-primary" onClick={send} disabled={!draft || sending}>
                    {sending ? 'Sending…' : draft ? `Send to ${draft.recipients.length} recipients` : 'Send'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
