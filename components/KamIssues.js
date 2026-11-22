'use client';
import { useEffect, useState } from 'react';

// KAM Feedback tab. Lists only the Ops Issues named to the signed-in KAM. Each KAM writes free-text KAM Feedback (column J on the sheet, and ops_issues).
const COLS = [
  ['Issue ID', 'issue_id'], ['Consignment ID', 'consignment_id'], ['Merchant Name', 'merchant_name'],
  ['Issue Category', 'issue_category'], ['Issue Sub Category', 'issue_sub_category'], ['HUB Feedback', 'hub_feedback'],
  ['Issue Status', 'issue_status'], ['Validation', 'validation'],
];

function IssueCard({ issue, onSaved }) {
  const [text, setText] = useState(issue.kam_feedback || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = text.trim() !== (issue.kam_feedback || '').trim();

  async function save() {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/ops-issues/${encodeURIComponent(issue.issue_id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kam_feedback: text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Save failed (${r.status})`);
      setMsg('Saved');
      onSaved(issue.issue_id, d.kam_feedback ?? null);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article style={{ border: '1px solid var(--line, #d9d9d9)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px 14px', margin: 0 }}>
        {COLS.map(([label, key]) => (
          <div key={key}>
            <dt style={{ fontSize: 11, opacity: 0.7 }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 13 }}>{issue[key] || '-'}</dd>
          </div>
        ))}
      </dl>
      <label style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 600 }} htmlFor={`fb-${issue.issue_id}`}>KAM Feedback</label>
      {issue.can_edit ? (
        <>
          <textarea id={`fb-${issue.issue_id}`} value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)}
            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, font: 'inherit' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <button type="button" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving...' : 'Save feedback'}</button>
            {msg && <span role="status" style={{ fontSize: 12 }}>{msg}</span>}
          </div>
        </>
      ) : (
        <p style={{ margin: '4px 0 0', fontSize: 13 }}>{issue.kam_feedback || '-'}</p>
      )}
    </article>
  );
}

export default function KamIssues() {
  const [issues, setIssues] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ops-issues', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Load failed (${r.status})`);
        if (!cancelled) setIssues(d.issues || []);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  function onSaved(id, value) {
    setIssues((list) => list.map((i) => (i.issue_id === id ? { ...i, kam_feedback: value } : i)));
  }

  return (
    <div style={{ padding: '16px 18px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>KAM Feedback</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.75 }}>Ops Issues named to you. Add your feedback for each one.</p>
      {error && <p role="alert">{error}</p>}
      {!error && issues === null && <p>Loading...</p>}
      {issues && issues.length === 0 && <p>No Ops Issues are named to you.</p>}
      {issues && issues.map((i) => <IssueCard key={i.issue_id} issue={i} onSaved={onSaved} />)}
    </div>
  );
}
