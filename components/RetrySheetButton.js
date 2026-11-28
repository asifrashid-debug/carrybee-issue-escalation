'use client';
// Shown on an escalated tracker card when its sheet write failed. Writes the issue to the team's sheet again.
// The card is a clickable block, so every click and key press inside this control stops at the wrapper.
import { useState } from 'react';

const stop = (ev) => ev.stopPropagation();

export default function RetrySheetButton({ issueId, team, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function retry() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/escalations/${encodeURIComponent(issueId)}/retry-sheet`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || `Could not retry (${res.status}).`); setBusy(false); return; }
      setBusy(false);
      onDone?.({ issueId, team, warning: j.warning || null });
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  return (
    <div onClick={stop} onKeyDown={stop} style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
      <span className="small sla-bad">Not on {team} sheet</span>
      <button type="button" className="btn sm" disabled={busy} onClick={retry} style={{ height: 32, fontSize: 12.5 }}>
        {busy ? 'Retrying…' : 'Retry sheet write'}
      </button>
      {error && <span role="alert" className="small sla-bad">{error}</span>}
    </div>
  );
}
