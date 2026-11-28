// Pure helpers for the tracker issue card. Shared by the main tracker (app/page.js has its own copies, unchanged)
// and the KAM-OPS team tabs (IR Issues, Central Sort, TNL), so those tabs show the same card as the tracker.
// No React, no network. Inputs are escalation rows from GET /api/escalations.
const fmt = (v) => Number(v).toLocaleString('en-US');

export const PRI_PILL = { P1: 'p-urg', P2: 'p-crit', P3: 'p-reg', P4: 'p-res' };

// Owner avatar: initials only, never the full name.
export function initials(n) {
  const p = String(n || '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return p.map((x) => x[0].toUpperCase()).join('') || '?';
}

// Hours as "3d 2h" for longer spans, "5h" for short ones.
export function spanText(h) {
  const x = Math.max(0, Math.round(h));
  return x >= 24 ? `${Math.floor(x / 24)}d ${x % 24}h` : `${x}h`;
}

// SLA state per row. Breach rules: no first comment more than 2h after being raised;
// unpicked past 4h; open past the category resolution SLA (days per zone, from the API).
export function sla(e, now = new Date()) {
  const age = e.submitted_at ? (now.getTime() - new Date(e.submitted_at).getTime()) / 3600000 : 0;
  if (e.ops_issue_status === 'Resolved') return { state: 'ok', text: 'Resolved' };
  if (!e.issue_response_datetime && age > 2) return { state: 'br', text: `No comment · ${fmt(Math.round(age - 2))}h over` };
  if (!e.business_pick_time && age > 4) return { state: 'br', text: `Unpicked · ${Math.round(age)}h` };
  if (!e.issue_response_datetime) return { state: 'risk', text: `${Math.max(0, 2 - age).toFixed(1)}h to limit` };
  const limitH = (e.resolution_days || 3) * 24;
  if (e.resolution_breach) return { state: 'br', text: `Resolution overdue · ${spanText(age - limitH)}` };
  const left = limitH - age;
  return { state: left < limitH * 0.2 ? 'risk' : 'ok', text: `Resolve in ${spanText(left)} · ${e.resolution_days || 3}d SLA` };
}

// CM pick SLA line (only CM-assigned MX issues). Deadline is pick_due_at from the API.
export function pickLine(e, now = new Date()) {
  if (!e.cm_assigned) return null;
  if (e.business_pick_time) {
    return e.pick_missed ? { cls: 'sla-bad', text: 'Picked late · justification' } : { cls: 'sla-ok', text: 'Picked on time' };
  }
  const left = (new Date(e.pick_due_at).getTime() - now.getTime()) / 60e3;
  if (left > 0) return { cls: 'sla-warn', text: `Pick due in ${Math.ceil(left)} min` };
  if (e.pick_phase === 'escalated') return { cls: 'sla-bad', text: 'Pick failure · CM Lead' };
  return { cls: 'sla-bad', text: `Pick overdue · ${Math.round(-left)} min` };
}

// KAM feedback line per row (phase comes from the API).
export function fbText(e, now = new Date()) {
  if (e.feedback_phase === 'escalated') return { cls: 'sla-bad', text: 'Feedback failure · Team Lead' };
  if (e.feedback_phase === 'justification_due') return { cls: 'sla-bad', text: 'Feedback overdue · justification due' };
  if (e.feedback_phase === 'pending') {
    const left = Math.max(0, (new Date(e.feedback_due_at).getTime() - now.getTime()) / 3600e3);
    return { cls: 'sla-warn', text: `Feedback due in ${left.toFixed(1)}h` };
  }
  if (e.kam_feedback_status === 'Resolved') return { cls: 'sla-ok', text: 'Closed · KAM feedback Resolved' };
  return { cls: 'sla-ok', text: `Feedback: ${e.kam_feedback_status}` };
}

// First hub layer response, shortened for the card.
export function hubText(e) {
  const t = [e.layer1_response, e.layer2_response, e.layer3_response].map((v) => String(v || '').trim()).find(Boolean) || '';
  return t.length > 90 ? `${t.slice(0, 87)}...` : t;
}
