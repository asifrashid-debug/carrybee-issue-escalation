// Round-robin owner for CM-assigned issues (MX issues whose KAM name is CM).
// Emails are compared in lowercase, because the session lowercases every email.
// Members are sorted, so the order is the same every time. The next owner is the member after the
// owner of the most recent CM-assigned issue. If that owner has left, the first member is used.
// Pure module: used by the raise route and by the CM pick and justification checks.
export function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Case-insensitive email match. Use for every CM owner check.
export function sameEmail(a, b) {
  const x = normEmail(a);
  return x !== '' && x === normEmail(b);
}

export function nextCmOwner(memberEmails, lastOwnerEmail) {
  const list = [...new Set((memberEmails || []).map(normEmail).filter(Boolean))].sort();
  if (!list.length) return null;
  const last = normEmail(lastOwnerEmail);
  const i = last ? list.indexOf(last) : -1;
  return list[(i + 1) % list.length];
}
