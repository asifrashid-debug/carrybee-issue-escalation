'use client';
import { useState } from 'react';

// Super admin only. Checks the Gmail token used by the IR drawer. Shows status and Google's error code. Never shows the token.
export default function GmailCheckPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function check() {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/admin/gmail-check', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #eee' };
  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Gmail token check</h1>
      <p style={{ marginTop: 0 }}>
        Checks the token in <code>GMAIL_OAUTH_REFRESH_TOKEN</code> for the IR mail lookup. It reads the mailbox address and
        token scope only. The token is never shown.
      </p>
      <button type="button" onClick={check} disabled={busy} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #888', cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Checking…' : 'Check the Gmail token'}
      </button>
      {error && <p role="alert" style={{ color: '#b00020', marginTop: 16 }}>{error}</p>}
      {result && (
        <section style={{ marginTop: 20, padding: 16, border: '1px solid #ccc', borderRadius: 10 }}>
          <p style={{ marginTop: 0, fontWeight: 700, color: result.ok ? '#0A7A56' : '#b00020' }}>
            {result.ok ? 'Gmail token works.' : 'Gmail token does not work.'}
          </p>
          <div style={row}><span>Step</span><span>{result.step}</span></div>
          {result.env && <div style={row}><span>Missing settings</span><span>{result.env.missing.length ? result.env.missing.join(', ') : 'none'}</span></div>}
          {result.mailbox && <div style={row}><span>Mailbox</span><span>{result.mailbox}</span></div>}
          {'gmail_user_setting_matches' in result && <div style={row}><span>Matches GMAIL_USER</span><span>{result.gmail_user_setting_matches ? 'yes' : 'no'}</span></div>}
          {'scopes_readonly' in result && <div style={row}><span>Read-only scope</span><span>{result.scopes_readonly ? 'yes' : 'no'}</span></div>}
          {result.google_error && <div style={row}><span>Google error</span><span>{result.google_error}</span></div>}
          {result.google_error_description && <div style={row}><span>Google message</span><span>{result.google_error_description}</span></div>}
          {result.error && <p style={{ marginBottom: 0, color: '#b00020' }}>{result.error}</p>}
        </section>
      )}
    </main>
  );
}
