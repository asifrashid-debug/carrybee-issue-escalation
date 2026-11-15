'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatDhaka, hoursSince } from '../lib/time';
import { PriPill, SlaPill, StatusPill, Zc } from './demo';

const LAYERS = [
  { key: 'layer1_response', label: 'Layer 1 · HUB Incharge', hours: 2 },
  { key: 'layer2_response', label: 'Layer 2 · Cluster Lead', hours: 4 },
  { key: 'layer3_response', label: 'Layer 3 · Regional Lead', hours: 6 },
];
const FB_OUTCOMES = ['Resolved', 'Not Resolved', 'Improper Remarks'];
const FU_LABEL = { done: 'Done', due: 'Due now', overdue: 'Overdue', waiting: 'Waiting', locked: 'Locked', hidden: 'Hidden' };
const FU_STATE = { done: 'done', due: 'due', overdue: 'late', waiting: 'wait', locked: 'locked', hidden: 'hidden' };
const STATE_LABEL = { done: 'Done', due: 'Due now', late: 'Late', wait: 'Waiting', locked: 'Locked', hidden: 'Not needed' };
const JSON_H = { 'Content-Type': 'application/json' };

function kamStatus(kam) {
  if (kam.done) return 'done';
  if (!kam.available) return 'hidden';
  return kam.dueAt && new Date(kam.dueAt) < new Date() ? 'overdue' : 'due';
}

// One item on the case timeline. The state sets the dot colour and the label.
function TL({ state, title, meta, action, children }) {
  return (
    <li className={`tl ${state}`}>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-main">
        <div className="tl-top"><b>{title}</b><span className="tl-state">{STATE_LABEL[state] || ''}</span></div>
        {meta && <div className="tl-meta">{meta}</div>}
        {children}
        {action && <div className="tl-act">{action}</div>}
      </div>
    </li>
  );
}

// Issue drawer (timeline layout). Same logic as before: every write goes through the existing API,
// which enforces roles, set-once rules and audit logging.
export default function IssueDrawer({ issueId, user, onClose, onChanged, onOpen }) {
  const [d, setD] = useState(null);
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState('case');
  const open = !!issueId;
  const hubReadOnly = user?.role === 'hub_ops';

  const load = useCallback(async () => {
    if (!issueId) return;
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/escalations/${issueId}`, { cache: 'no-store' }),
        fetch(`/api/escalations/${issueId}/followup`, { cache: 'no-store' }),
      ]);
      const ja = await a.json();
      const jb = await b.json().catch(() => ({}));
      if (!a.ok) { setErr(ja.error || 'Could not load this issue'); setD(null); return; }
      setErr(null);
      setD({ data: ja.data, audit: ja.audit || [], feedback: ja.feedback || null, pick: ja.pick || null });
      setPlan(b.ok ? jb.plan : null);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, [issueId]);

  useEffect(() => {
    setD(null); setPlan(null); setMsg(null); setErr(null); setDrafts({}); setTab('case');
    load();
  }, [issueId, load]);

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  async function run(name, request, okText) {
    setBusy(name); setMsg(null);
    try {
      const r = await request();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      setMsg({ tone: 'ok', text: okText });
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      setMsg({ tone: 'bad', text: String(e.message || e) });
    } finally {
      setBusy(null);
    }
  }

  const actor = () => ({ actor_email: user.email, actor_role: user.role });
  const pick = () => run('pick', () => fetch(`/api/escalations/${issueId}/pick`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ actor_email: user.email }) }), 'Picked. The pick is recorded once with your name and time.');
  const saveFeedback = () => run('fb', () => fetch(`/api/escalations/${issueId}`, { method: 'PATCH', headers: JSON_H, body: JSON.stringify({ kam_feedback_status: drafts.fb, ...actor() }) }), 'KAM feedback saved to the audit trail.');
  const submitJustification = () => run('just', () => fetch(`/api/escalations/${issueId}/feedback-justification`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ justification: drafts.just || '' }) }), 'Justification recorded. The 24h feedback window has reopened.');
  const submitPickJustification = () => run('pjust', () => fetch(`/api/escalations/${issueId}/pick-justification`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ justification: drafts.pjust || '' }) }), 'Justification recorded for the missed pick.');
  const followup = (level) => run(`fu-${level}`, () => fetch(`/api/escalations/${issueId}/followup`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ level, actor_email: user.email }) }), 'Follow-up recorded in the audit log.');

  const e = d?.data;
  const fb = d?.feedback;
  const pk = d?.pick;
  const age = e ? hoursSince(e.submitted_at) : 0;
  const commentState = e ? (!e.issue_response_datetime && age > 2 ? 'br' : (!e.issue_response_datetime && age > 1 ? 'risk' : 'ok')) : 'ok';
  // Resolution breach (category SLA days for the zone) also turns the badge red
  const slaState = e && e.resolution_breach ? 'br' : commentState;
  const audit = d?.audit || [];
  const layer1Filled = !!(e?.layer1_response || '').trim();

  // The one thing the viewer should do next, pinned under the stats.
  let next = { tone: 'calm', text: 'No action needed from you yet. Waiting on the hub.' };
  if (e && pk?.phase === 'justification_due' && pk.can_justify && !hubReadOnly) {
    next = { tone: 'warn', text: `Give a pick justification (${pk.justifications_used + 1} of ${pk.justification_limit}) within 24h.` };
  } else if (e && !e.issue_pick_time && !hubReadOnly) {
    next = { tone: 'warn', text: 'Pick this issue. A pick is set once.' };
  } else if (e && fb?.phase === 'justification_due' && fb.can_justify && !hubReadOnly) {
    next = { tone: 'warn', text: `Give a feedback justification (${fb.justifications_used + 1} of ${fb.justification_limit}) to reopen the 24h window.` };
  } else if (e && fb?.can_respond && fb.phase === 'pending' && !hubReadOnly) {
    next = { tone: 'warn', text: 'KAM feedback is due. Choose an outcome.' };
  } else if (e && !layer1Filled && age > 2) {
    next = { tone: 'bad', text: 'Hub layer 1 is overdue. Waiting on the hub response sheet.' };
  }

  return (
    <>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer ${open ? 'on' : ''}`} role="dialog" aria-modal="true" aria-labelledby="drawer-title" aria-hidden={!open}>
        {open && (
          <>
            <div className="dh">
              <div className="dtop">
                <span className="idc" id="drawer-title">{issueId}</span>
                {e && <Zc z={`${e.zone} · ${e.concern_hub || '—'}`} />}
                {e && <PriPill p={e.priority_scale} />}
                {e && <StatusPill s={e.issue_status} />}
                {e && <SlaPill state={slaState} />}
                <button type="button" className="xb" onClick={onClose} aria-label="Close">×</button>
              </div>
              {e && <h2 className="dtitle">{e.issue_category || 'Issue'}{e.issue_sub_category ? ` · ${e.issue_sub_category}` : ''}</h2>}
              {e && <div className="dsub">Submitted {formatDhaka(e.submitted_at)} by <b>{e.kam_name || e.email || '—'}</b> ({e.channel || '—'})</div>}

              {e && (
                <div className="stats3">
                  <div><small>Open for</small><b>{Math.round(age)}h</b></div>
                  <div><small>Resolve by</small><b className={e.resolution_breach ? 'bad' : ''}>{e.resolution_due_at ? formatDhaka(e.resolution_due_at) : '—'}</b></div>
                  <div><small>Hub layer 1</small><b className={layer1Filled ? 'good' : age > 2 ? 'bad' : ''}>{layer1Filled ? 'Responded' : age > 2 ? 'Overdue' : 'Waiting'}</b></div>
                </div>
              )}
              {e && <div className={`nextstep ${next.tone}`}><small>Next step</small><p>{next.text}</p></div>}

              <div className="dtabs">
                <button type="button" className={tab === 'case' ? 'on' : ''} onClick={() => setTab('case')}>Case</button>
                <button type="button" className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Activity ({audit.length + 1})</button>
              </div>
            </div>

            <div className="dbody">
              {err && <div className="box box-bad" role="alert">{err}</div>}
              {!d && !err && <div className="empty">Loading issue…</div>}
              {e && msg && <div className={`box box-${msg.tone}`} role="status">{msg.text}</div>}

              {e && tab === 'case' && (
                <>
                  <div className="kvs">
                    <div><b>Consignment ID</b><span>{e.consignment_id || '—'}</span></div>
                    <div><b>Merchant</b><span>{e.merchant_name || '—'}</span></div>
                    <div><b>Category</b><span>{e.issue_category || '—'}{e.issue_sub_category ? ` · ${e.issue_sub_category}` : ''}</span></div>
                    <div><b>Hub</b><span>{e.concern_hub || '—'}</span></div>
                    <div><b>Channel / KAM</b><span>{e.channel || '—'} · {e.kam_name || '—'}</span></div>
                    <div><b>Open for</b><span>{Math.round(age)}h</span></div>
                  </div>

                  {e.duplicate_of && (
                    <div className="box box-warn">
                      Possible duplicate of <button type="button" className="linkbtn" onClick={() => onOpen(e.duplicate_of)}>{e.duplicate_of}</button> (same Consignment ID and category).
                    </div>
                  )}

                  <div className="sec2">
                    <h4>Issue details</h4>
                    <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{e.issue_details || '—'}</div>
                  </div>

                  <h3 className="tl-h">Timeline</h3>
                  <ol className="tl-list">
                    <TL state="done" title="Escalation created" meta={`${formatDhaka(e.submitted_at)} · ${e.channel || '—'} · ${e.kam_name || '—'}`} />

                    {/* CM pick (set once) with its SLA and justifications */}
                    {e.issue_pick_time ? (
                      <TL state="done" title="CM pick" meta={`Picked ${formatDhaka(e.issue_pick_time)}`}>
                        {pk?.justifications?.length > 0 && (
                          <ul className="audit">
                            {pk.justifications.map((j) => (
                              <li key={j.round}><b>Justification {j.round}</b> · {j.justification} <span className="muted">· {j.submitted_by} · {formatDhaka(j.submitted_at)}</span></li>
                            ))}
                          </ul>
                        )}
                      </TL>
                    ) : hubReadOnly ? (
                      <TL state="wait" title="CM pick" meta="Not picked yet. Picks come from the hub response sheet." />
                    ) : (
                      <TL
                        state={pk?.phase === 'escalated' || pk?.phase === 'justification_due' ? 'late' : 'due'}
                        title="CM pick"
                        meta={pk?.applies ? `${pk.priority} within ${pk.minutes_limit} min · due by ${formatDhaka(pk.deadline_at)} · ${pk.phase_label || ''}` : 'Not picked yet. A pick is set once.'}
                        action={<button type="button" className="btn y sm" disabled={!!busy} onClick={pick}>{busy === 'pick' ? 'Picking…' : 'Pick issue'}</button>}
                      >
                        {pk?.phase === 'justification_due' && <div className="box box-warn">{pk.missed && pk.picked_at ? 'The pick was late' : 'The pick was missed'}. Give a justification ({pk.justifications_used + 1} of {pk.justification_limit}) within 24h.</div>}
                        {pk?.phase === 'escalated' && <div className="box box-bad">Pick failure. The justification window passed. Raised to the CM Lead.</div>}
                        {pk?.justifications?.length > 0 && (
                          <ul className="audit">
                            {pk.justifications.map((j) => (
                              <li key={j.round}><b>Justification {j.round}</b> · {j.justification} <span className="muted">· {j.submitted_by} · {formatDhaka(j.submitted_at)}</span></li>
                            ))}
                          </ul>
                        )}
                        {pk?.can_justify && !hubReadOnly && (
                          <div className="fgrid" style={{ marginTop: 10 }}>
                            <label className="field full" style={{ display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 700 }}>Why the pick was missed (at least 20 characters)
                              <textarea className="inp" rows={3} value={drafts.pjust ?? ''} onChange={(ev) => setDrafts({ ...drafts, pjust: ev.target.value })} />
                            </label>
                            <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button type="button" className="btn y sm" disabled={!!busy} onClick={submitPickJustification}>{busy === 'pjust' ? 'Submitting…' : 'Submit justification'}</button>
                            </div>
                          </div>
                        )}
                      </TL>
                    )}

                    {/* Hub layers 1-3: read-only, from the hub response sheet */}
                    {LAYERS.map((L, i) => {
                      const filled = !!(e[L.key] || '').trim();
                      const above = LAYERS.slice(0, i).every((x) => !(e[x.key] || '').trim());
                      const red = !filled && above && age > L.hours;
                      const state = filled ? 'done' : red ? 'late' : 'wait';
                      return (
                        <TL key={L.key} state={state} title={L.label}
                          meta={filled ? 'Responded' : red ? `Overdue · past ${L.hours}h` : 'Awaiting hub response sheet'}>
                          {filled && <p className="tl-body">{e[L.key]}</p>}
                        </TL>
                      );
                    })}

                    {/* KAM feedback: 24h window, justification reopens it */}
                    {fb && (
                      <TL
                        state={fb.status && fb.status !== 'Pending' ? 'done' : fb.phase === 'justification_due' || fb.phase === 'escalated' ? 'late' : fb.can_respond ? 'due' : 'wait'}
                        title="KAM feedback"
                        meta={`${fb.status || 'Pending'} · ${fb.phase_label || ''}${fb.phase === 'pending' && fb.due_at ? ` · due ${formatDhaka(fb.due_at)}` : ''}`}
                      >
                        {fb.phase === 'justification_due' && <div className="box box-warn">Feedback was not given within 24h. Give a justification ({fb.justifications_used + 1} of {fb.justification_limit}) to reopen the 24h window.</div>}
                        {fb.phase === 'escalated' && <div className="box box-bad">Raised to the Team Lead as a Feedback failure after {fb.justification_limit} justifications.</div>}
                        {fb.justifications.length > 0 && (
                          <ul className="audit">
                            {fb.justifications.map((j) => (
                              <li key={j.round}><b>Justification {j.round}</b> · {j.justification} <span className="muted">· {j.submitted_by} · {formatDhaka(j.submitted_at)}</span></li>
                            ))}
                          </ul>
                        )}
                        {fb.can_justify && !hubReadOnly && (
                          <div className="fgrid" style={{ marginTop: 10 }}>
                            <label className="field full" style={{ display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 700 }}>Justification (at least 20 characters)
                              <textarea className="inp" rows={3} value={drafts.just ?? ''} onChange={(ev) => setDrafts({ ...drafts, just: ev.target.value })} />
                            </label>
                            <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button type="button" className="btn y sm" disabled={!!busy} onClick={submitJustification}>{busy === 'just' ? 'Submitting…' : 'Submit justification'}</button>
                            </div>
                          </div>
                        )}
                        {fb.can_respond && fb.phase !== 'justification_due' && !hubReadOnly && (
                          <div className="row" style={{ marginTop: 10 }}>
                            <label style={{ display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 700 }}>Feedback outcome
                              <select className="inp" value={drafts.fb ?? ''} onChange={(ev) => setDrafts({ ...drafts, fb: ev.target.value })}>
                                <option value="">Choose outcome…</option>
                                {FB_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </label>
                            <button type="button" className="btn y sm" disabled={!!busy || !drafts.fb} onClick={saveFeedback}>{busy === 'fb' ? 'Saving…' : 'Save feedback'}</button>
                          </div>
                        )}
                        {!fb.can_respond && !fb.can_justify && fb.status === 'Pending' && <div className="muted" style={{ fontSize: 12.5 }}>Only the KAM or CM owner of this issue can respond.</div>}
                      </TL>
                    )}

                    {/* Follow-ups: KAM, then CM 1st to 3rd */}
                    {plan && (
                      <>
                        <TL
                          state={FU_STATE[kamStatus(plan.kam)]}
                          title="KAM follow-up"
                          meta={`${FU_LABEL[kamStatus(plan.kam)]}${plan.kam.dueAt ? ` · due ${formatDhaka(plan.kam.dueAt)}` : ''}${plan.kam.hiddenReason && kamStatus(plan.kam) === 'hidden' ? ` · ${plan.kam.hiddenReason}` : ''}`}
                          action={!hubReadOnly && plan.kam.available && !plan.kam.done
                            ? <button type="button" className="btn y sm" disabled={!!busy} onClick={() => followup(0)}>{busy === 'fu-0' ? 'Recording…' : 'Record'}</button>
                            : null}
                        />
                        {plan.cm.map((c, i) => (
                          <TL
                            key={i}
                            state={FU_STATE[c.status] || 'wait'}
                            title={`CM ${['1st', '2nd', '3rd'][i]} follow-up`}
                            meta={`${FU_LABEL[c.status] || c.status}${c.dueAt ? ` · due ${formatDhaka(c.dueAt)}` : ''}`}
                            action={!hubReadOnly && c.unlocked && !c.done
                              ? <button type="button" className="btn y sm" disabled={!!busy} onClick={() => followup(i + 1)}>{busy === `fu-${i + 1}` ? 'Recording…' : 'Record'}</button>
                              : null}
                          />
                        ))}
                      </>
                    )}
                  </ol>
                </>
              )}

              {e && tab === 'log' && (
                <div className="alog">
                  <div className="entry">
                    <div className="t"><span className="evt">Escalation Created</span><span className="mono" style={{ color: 'var(--mut)' }}>{e.channel === 'MX' ? 'FORM_MX' : 'FORM_KAM'}</span></div>
                    <div style={{ fontWeight: 700, color: 'var(--good)' }}>Channel={e.channel || '—'}, Zone={e.zone || '—'}, Hub={e.concern_hub || '—'}, Priority={e.priority_scale || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--mut)' }}>By <b style={{ color: 'var(--ink2)' }}>{e.email || '—'}</b></div>
                    <div className="mono" style={{ color: 'var(--mut)', textAlign: 'right' }}>{formatDhaka(e.submitted_at)}</div>
                  </div>
                  {audit.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No changes yet.</div>}
                  {audit.slice().reverse().map((a, i) => (
                    <div className="entry" key={i}>
                      <div className="t"><span className="evt">{a.field_name}</span><span className="mono" style={{ color: 'var(--mut)' }}>{a.source || 'TRACKER'}</span></div>
                      <div style={{ fontWeight: 700, color: 'var(--good)' }}>{a.new_value || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--mut)' }}>By <b style={{ color: 'var(--ink2)' }}>{a.actor_email || '—'}</b></div>
                      <div className="mono" style={{ color: 'var(--mut)', textAlign: 'right' }}>{formatDhaka(a.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
