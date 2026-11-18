'use client';
import { useEffect, useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Super admin only. Shows the draft, lets the admin pick recipients and add addresses,
// and sends only after confirmation.
export default function SendReportButton() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(new Set()); // emails ticked (access list and added)
  const [custom, setCustom] = useState([]);            // typed-in addresses
  const [newEmail, setNewEmail] = useState('');
  const [addErr, setAddErr] = useState(null);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((me) => setIsAdmin(me?.role === 'admin')).catch(() => {});
  }, []);

  async function openDraft() {
    setOpen(true); setDraft(null); setErr(null); setResult(null); setAddErr(null); setNewEmail(''); setCustom([]); setLoading(true);
    try {
      const r = await fetch('/api/report/draft', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDraft(j);
      setSelected(new Set(j.recipients.map((x) => x.email)));
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  function toggle(email) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  function addAddress() {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setAddErr('Enter a valid email address.'); return; }
    if ((draft?.recipients || []).some((r) => r.email === email) || custom.includes(email)) { setAddErr('This address is already in the list.'); return; }
    if (custom.length >= 20) { setAddErr('You can add up to 20 extra addresses.'); return; }
    setCustom((prev) => [...prev, email]);
    setSelected((prev) => new Set([...prev, email]));
    setNewEmail(''); setAddErr(null);
  }

  function removeAddress(email) {
    setCustom((prev) => prev.filter((e) => e !== email));
    setSelected((prev) => { const next = new Set(prev); next.delete(email); return next; });
  }

  async function send() {
    if (sending || !draft) return;
    const recipients = (draft.recipients || []).map((r) => r.email).filter((e) => selected.has(e));
    const extra = custom.filter((e) => selected.has(e));
    if (recipients.length + extra.length === 0) { setErr('Select at least one recipient.'); return; }
    setSending(true); setErr(null);
    try {
      const r = await fetch('/api/report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, asOf: draft.asOf, recipients, custom: extra }),
      });
      const j = await r.json();
      if (!r.ok && r.status !== 207) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
    } catch (e) { setErr(e.message); } finally { setSending(false); }
  }

  if (!isAdmin) return null;
  const close = () => { if (!sending) setOpen(false); };
  const chosenCount = (draft ? draft.recipients.filter((r) => selected.has(r.email)).length : 0)
    + custom.filter((e) => selected.has(e)).length;

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

                  <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Recipients</h3>
                  <div style={{ border: '1px solid rgba(128,128,128,0.3)', borderRadius: 6, padding: '6px 10px' }}>
                    {draft.recipients.map((r) => (
                      <label key={r.email} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
                        <input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} disabled={sending} />
                        <span><b>{r.name}</b> · {r.email} · {r.scope === 'all' ? 'all teams' : (r.teams || []).join(', ')}</span>
                      </label>
                    ))}
                    {custom.map((email) => (
                      <div key={email} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
                        <input type="checkbox" checked={selected.has(email)} onChange={() => toggle(email)} disabled={sending} />
                        <span>{email} · <i>added (all teams)</i></span>
                        <button type="button" className="btn" onClick={() => removeAddress(email)} disabled={sending} style={{ marginLeft: 'auto', fontSize: 12 }}>Remove</button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => { setNewEmail(e.target.value); setAddErr(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAddress(); } }}
                      placeholder="Add another email address"
                      disabled={sending}
                      style={{ flex: '1 1 260px', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit' }}
                    />
                    <button type="button" className="btn" onClick={addAddress} disabled={sending || !newEmail.trim()}>Add</button>
                  </div>
                  {addErr && <div className="box box-bad" role="alert" style={{ marginTop: 8 }}>{addErr}</div>}
                  <p style={{ margin: '10px 0 12px', fontSize: 12, opacity: 0.7 }}>Preview shows your copy, with all teams. Team leads receive only their own team. Added addresses receive the all-teams copy.</p>

                  <iframe title="Draft email preview" srcDoc={draft.html} sandbox="" style={{ width: '100%', height: 480, border: '1px solid rgba(128,128,128,0.3)', borderRadius: 6, background: '#fff' }} />
                </>
              )}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(128,128,128,0.25)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {result ? (
                <button type="button" className="btn-primary" onClick={close}>Done</button>
              ) : (
                <>
                  <button type="button" className="btn" onClick={close} disabled={sending}>Cancel</button>
                  <button type="button" className="btn-primary" onClick={send} disabled={!draft || sending || chosenCount === 0}>
                    {sending ? 'Sending…' : `Send to ${chosenCount} recipient${chosenCount === 1 ? '' : 's'}`}
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
