// Picks which report emails to send, based on the super admin's choices in the Send report dialog.
// Access-list recipients keep their normal scope (team leads: own team; admin and CM lead: all teams).
// Typed-in addresses that are not on the access list receive the all-teams copy.
import { buildMessages, recipientPlan } from './dailyReport.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_CUSTOM = 20;

export function normalizeEmails(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
}

// Validates typed-in addresses. Returns { custom } or { error }.
export function checkCustom(list) {
  const custom = normalizeEmails(list);
  if (custom.length > MAX_CUSTOM) return { error: `Too many added addresses (max ${MAX_CUSTOM}).` };
  const bad = custom.filter((e) => !EMAIL_RE.test(e));
  if (bad.length) return { error: `Invalid email address: ${bad.join(', ')}` };
  return { custom };
}

// selected: access-list emails the admin ticked. custom: typed-in emails (already validated).
// Returns the message objects to send. Unknown addresses in `selected` are ignored.
export function selectMessages({ report, users, selected = [], custom = [], appUrl = '' }) {
  const planned = new Set(recipientPlan(users).map((r) => r.email));
  const extras = custom
    .filter((e) => !planned.has(e))
    .map((e) => ({ email: e, display_name: e, role: 'admin', teams: [] }));
  const messages = buildMessages(report, [...(users || []), ...extras], { appUrl });
  const want = new Set([
    ...normalizeEmails(selected).filter((e) => planned.has(e)),
    ...custom,
  ]);
  return messages.filter((m) => want.has(m.to));
}
