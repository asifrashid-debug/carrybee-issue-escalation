'use client';
// "Escalate to" on a tracker card: pick IR, Central Sort or TNL, then confirm.
// IR asks for a Mail Subject Line. Central Sort and TNL ask for nothing extra.
// The card is a clickable block, so every click and key press inside this control stops at the wrapper.
import { useState } from 'react';
import { ESCALATE_TEAMS, escalateError, escalateTeam } from '../lib/escalateTo.mjs';
import { IR_MAIL_SUBJECT_MAX } from '../lib/irEscalation.mjs';

const stop = (ev) => ev.stopPropagation();

export default function EscalateButton({ issueId, onDone }) {
  const [step, setStep] = useState('closed'); // closed | menu | confirm
  const [team, setTeam] = useState(null);
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function reset() { setStep('closed'); setTeam(null); setSubject(''); setError(null); }

  function pick(key) {
    setTeam(escalateTeam(key));
    setError(null);
    setStep('confirm');
  }

  async function send() {
    const err = escalateError(team, subject);
    if (err) { setError(err); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/escalations/${encodeURIComponent(issueId)}/escalate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ team: team.key, mail_subject: team.key === 'ir' ? subject : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || `Could not escalate (${res.status}).`); setBusy(false); return; }
      reset();
      onDone?.({ issueId, team: team.label, warning: j.warning || null });
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  return (
    <div onClick={stop} onKeyDown={stop} style={{ display: 'grid', gap: 6, justifyItems: 'end', position: 'relative' }}>
      {step === 'closed' && (
        <button type="button" className="btn sm" aria-haspopup="menu" aria-expanded={false} onClick={(ev) => { ev.stopPropagation(); setStep('menu'); }} style={{ height: 32, fontSize: 12.5 }}>
          Escalate to ▾
        </button>
      )}

      {step === 'menu' && (
        <div role="menu" aria-label={`Escalate ${issueId} to`} style={{ display: 'grid', gap: 4, minWidth: 150 }}>
          {Object.values(ESCALATE_TEAMS).map((t) => (
            <button key={t.key} type="button" role="menuitem" className="btn sm" onClick={() => pick(t.key)} style={{ height: 30, fontSize: 12.5, justifyContent: 'flex-start' }}>
              {t.label}
            </button>
          ))}
          <button type="button" className="btn sm" onClick={reset} style={{ height: 30, fontSize: 12.5 }}>Cancel</button>
        </div>
      )}

      {step === 'confirm' && team && (
        <div role="group" aria-label={`Confirm escalation of ${issueId} to ${team.label}`} style={{ display: 'grid', gap: 6, minWidth: 240, textAlign: 'left' }}>
          <div className="small"><b>Escalate to {team.label}?</b></div>
          {team.key === 'ir' && (
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
              Mail Subject Line (required)
              <input
                type="text"
                value={subject}
                maxLength={IR_MAIL_SUBJECT_MAX}
                autoFocus
                onChange={(e) => setSubject(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                style={{ padding: '6px 8px' }}
              />
            </label>
          )}
          {error && <div role="alert" className="small sla-bad">{error}</div>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn sm" disabled={busy} onClick={reset}>Cancel</button>
            <button type="button" className="btn primary sm" disabled={busy} onClick={send}>{busy ? 'Sending…' : `Send to ${team.label}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
