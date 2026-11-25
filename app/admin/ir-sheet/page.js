'use client';
import { useState } from 'react';

// Super admin only (the /admin path is admin-only in middleware, and the API checks the role again).
// Creates a NEW IR sheet with the app's own Drive/Sheets permission and shows its ID for IR_SHEET_ID.
export default function IrSheetPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function createSheet() {
    if (!window.confirm('Create a NEW IR sheet? Use this once. The old sheet will no longer be used after you change IR_SHEET_ID.')) return;
    setBusy(true); setError(''); setResult(null); setCopied(false);
    try {
      const res = await fetch('/api/admin/ir-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyId() {
    if (!result?.id) return;
    try {
      await navigator.clipboard.writeText(result.id);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the ID and copy it by hand.');
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px', fontFamily: 'inherit', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>IR sheet (create once)</h1>
      <p style={{ marginTop: 0 }}>
        This creates a new IR Issue Escalation sheet with the 18 headers and the IR Status dropdown. The app creates it,
        so the app can write to it. Use this once; each click makes another sheet.
      </p>

      <button type="button" onClick={createSheet} disabled={busy}
        style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #888', cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Working…' : 'Create the IR sheet'}
      </button>

      {error && (
        <p role="alert" style={{ color: '#b00020', marginTop: 16 }}>{error}</p>
      )}

      {result && (
        <section style={{ marginTop: 20, padding: 16, border: '1px solid #ccc', borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>Sheet created.</p>
          <p style={{ margin: '8px 0' }}><strong>IR_SHEET_ID</strong></p>
          <code style={{ display: 'block', padding: 10, borderRadius: 6, background: '#f4f4f4', wordBreak: 'break-all' }}>
            {result.id}
          </code>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyId}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #888', cursor: 'pointer' }}>
              {copied ? 'Copied' : 'Copy ID'}
            </button>
            <a href={result.url} target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #888' }}>
              Open sheet
            </a>
          </div>
          <div style={{ marginTop: 16 }}>
            {result.env_matches ? (
              <p style={{ margin: 0 }}>IR_SHEET_ID in Vercel already matches this sheet. No change needed.</p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li>In Vercel, open <strong>carrybee-escalation-tracker</strong> → Settings → Environment Variables.</li>
                <li>Edit <strong>IR_SHEET_ID</strong> and paste the ID above. Environment: <strong>Production</strong>.</li>
                <li>Redeploy Production so the new value applies.</li>
                <li>Install the IR Apps Script on the new sheet (see apps-script/IR-Code.gs header), then set the sheet&apos;s link sharing to Restricted.</li>
              </ol>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
