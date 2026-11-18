// Round-robin owner for CM-assigned issues (MX issues whose KAM name is CM).
// Members are sorted by email so the order is the same every time. The next owner is the member
// after the owner of the most recent CM-assigned issue. If that owner has left, the first member is used.
// Pure module: used by the raise route and tested in tests/cm-owner.test.mjs.
export function nextCmOwner(memberEmails, lastOwnerEmail) {
  const list = [...new Set((memberEmails || []).map((e) => String(e || '').trim()).filter(Boolean))].sort();
  if (!list.length) return null;
  const i = lastOwnerEmail ? list.indexOf(String(lastOwnerEmail).trim()) : -1;
  return list[(i + 1) % list.length];
}
