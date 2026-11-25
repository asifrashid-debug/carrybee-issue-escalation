'use client';
import { useState } from 'react';

// Super admin only (the /admin path is admin-only in middleware, and the API checks the role again).
// Creates the IR attachments folder and shows its ID for DRIVE_IR_FOLDER_ID.
export default function IrFolderPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function createFolder() {
    setBusy(true); setError(''); setResult(null); setCopied(false);
    try {
      const res = await fetch('/api/admin/ir-folder', { method: 'POST' });
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
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>IR attachments folder</h1>
      <p style={{ marginTop: 0 }}>
        This creates the Google Drive folder where IR attachment zips are saved. It is created with the app&apos;s own
        Drive permission, so it is the folder the app can write to. If it already exists, the same folder is shown.
      </p>

      <button type="button" onClick={createFolder} disabled={busy}
        style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #888', cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Working…' : 'Create or find the IR folder'}
      </button>

      {error && (
        <p role="alert" style={{ color: '#b00020', marginTop: 16 }}>{error}</p>
      )}

      {result && (
        <section style={{ marginTop: 20, padding: 16, border: '1px solid #ccc', borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>
            {result.created ? 'Folder created.' : 'Folder already exists. Using it.'}
          </p>
          <p style={{ margin: '8px 0' }}>
            <strong>DRIVE_IR_FOLDER_ID</strong>
          </p>
          <code style={{ display: 'block', padding: 10, borderRadius: 6, background: '#f4f4f4', wordBreak: 'break-all' }}>
            {result.id}
          </code>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyId}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #888', cursor: 'pointer' }}>
              {copied ? 'Copied' : 'Copy ID'}
            </button>
            <a href={result.link} target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #888' }}>
              Open folder in Drive
            </a>
          </div>

          <div style={{ marginTop: 16 }}>
            {result.env_matches ? (
              <p style={{ margin: 0 }}>DRIVE_IR_FOLDER_ID in Vercel already matches this folder. No change needed.</p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li>In Vercel, open the project <strong>carrybee-escalation-tracker</strong> → Settings → Environment Variables.</li>
                <li>Add (or edit) <strong>DRIVE_IR_FOLDER_ID</strong> with the ID above. Environment: <strong>Production</strong>.</li>
                <li>Redeploy the Production deployment so the new value applies.</li>
              </ol>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
