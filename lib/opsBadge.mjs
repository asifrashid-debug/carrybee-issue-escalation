// Ops-KAM badge rules. Pure module: no imports, so the header, the Ops-KAM page and the tests share one rule.
// An Ops Issue is "new" while its Issue Status is 'Raised' and this browser has not yet seen it.
// "Seen" is recorded when the Ops-KAM tab loads (see components/useOpsBadge.js).

export const NEW_STATUS = 'Raised';

export function isNewIssue(issue) {
  return String(issue?.issue_status ?? '').trim() === NEW_STATUS;
}

// Sorted, de-duplicated ids of every issue still at Raised.
export function raisedIssueIds(issues) {
  const ids = new Set();
  for (const i of issues || []) {
    if (isNewIssue(i) && i.issue_id) ids.add(String(i.issue_id));
  }
  return [...ids].sort();
}

// How many Raised issues are not in the seen list.
export function unseenCount(issues, seenIds) {
  const seen = new Set((seenIds || []).map(String));
  return raisedIssueIds(issues).filter((id) => !seen.has(id)).length;
}

// One storage key per viewer, so two people on the same browser keep separate badges.
export function seenStorageKey(viewer) {
  return `cb-ops-seen:${String(viewer || '').trim().toLowerCase()}`;
}

// The stored value is a JSON array of issue ids. Anything else reads as an empty list.
export function parseSeen(raw) {
  if (raw == null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch (e) {
    return [];
  }
}
