// Tracker badge rules. Pure module: no imports, so the API route, the header and the tests share one rule.
//
// Who: an MX-channel escalation counts for a viewer when the viewer is named on it:
//   - the viewer raised it (email),
//   - the viewer is its CM owner (cm_owner_email), or
//   - the viewer's name (display name or KAM alias) is its KAM name (kam_name), for requester, team_lead and mx roles.
// What: it counts once a Layer 1, 2 or 3 response is present.
// Seen: per issue, per browser. Opening the issue in the Tracker records the fingerprint of its layer responses.
//       A later layer response changes the fingerprint, so the issue counts again.
// Separate from the Ops-KAM badge: its own rule and its own seen list.

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const KAM_BADGE_ROLES = ['requester', 'team_lead', 'mx'];

// The three layer responses, trimmed, in order.
function layerTexts(esc) {
  return [esc?.layer1_response, esc?.layer2_response, esc?.layer3_response].map((v) => String(v ?? '').trim());
}

export function hasLayerResponse(esc) {
  return layerTexts(esc).some((t) => t.length > 0);
}

// Short, stable fingerprint of the layer responses (32-bit FNV-1a, hex). Stored in the browser instead of the text.
export function layerFingerprint(esc) {
  const s = layerTexts(esc).join('\u0001');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// KAM names the viewer can be named by: display name and aliases, without the CM queue placeholder.
export function viewerKamNames(viewer) {
  return [viewer?.display_name, ...(viewer?.kam_aliases || [])].map(norm).filter((n) => n && n !== 'cm');
}

// True when the viewer is named on this MX-channel escalation (see the rules at the top).
export function isNamedToViewer(esc, viewer) {
  if (!esc || !viewer || esc.channel !== 'MX') return false;
  const me = norm(viewer.email);
  if (me && norm(esc.email) === me) return true;
  if (me && norm(esc.cm_owner_email) === me) return true;
  if (KAM_BADGE_ROLES.includes(viewer.role)) {
    const kam = norm(esc.kam_name);
    if (kam && viewerKamNames(viewer).includes(kam)) return true;
  }
  return false;
}

// Badge items for a viewer: named issues that have a layer response. Sorted by issue id.
export function trackerItems(escs, viewer) {
  const out = [];
  for (const e of escs || []) {
    if (!e?.issue_id || !isNamedToViewer(e, viewer) || !hasLayerResponse(e)) continue;
    out.push({ issue_id: String(e.issue_id), fingerprint: layerFingerprint(e) });
  }
  return out.sort((a, b) => (a.issue_id < b.issue_id ? -1 : a.issue_id > b.issue_id ? 1 : 0));
}

// Items the viewer has not opened at their current fingerprint.
export function unseenTrackerItems(items, seenMap) {
  return (items || []).filter((i) => (seenMap || {})[i.issue_id] !== i.fingerprint);
}

// localStorage key per viewer (lower-cased email).
export function trackerSeenKey(viewerEmail) {
  return `cb-tracker-seen:${norm(viewerEmail)}`;
}

// Stored value: JSON object { issue_id: fingerprint }. Anything else reads as an empty map.
export function parseSeenMap(raw) {
  if (raw == null) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out = {};
    for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = val;
    return out;
  } catch (e) {
    return {};
  }
}

// The seen map after opening one issue.
export function withSeen(seenMap, issueId, fingerprint) {
  return { ...(seenMap || {}), [String(issueId)]: fingerprint };
}
