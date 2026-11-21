// Legacy (OLD) issue import. Rows come from the OCT'26 Google Form response tabs (ISD, OSD, CTG).
// Apps Script does the sheet reading and sends clean strings; this module validates and maps them.
// Pure functions only (no network, no sheet access) so they can be tested without dependencies.

export const LEGACY_PREFIX = 'OLD-';
export const LEGACY_ID_RE = /^OLD-(ISD|OSD|CTG)-[0-9A-F]{10}$/;
export const LEGACY_FROM_ISO = '2026-11-01T00:00:00+06:00'; // Asia/Dhaka, same cut-off as the 17 Nov import
const DAY_MS = 24 * 3600e3;

const PRI = { Critical: 'P1', Urgent: 'P2', Regular: 'P3', '': 'P4' };
const CH = { KAM: 'KAM', 'Contact center': 'MX' };
// 'On process' is not a hub value; the 17 Nov import excluded those rows. Kept the same here.
const KFS = { '': 'Pending', Pending: 'Pending', Resolved: 'Resolved', Solved: 'Resolved',
  'Not Resolved': 'Not Resolved', 'Improper Remarks': 'Improper Remarks' };
const CONSIGNMENT_RE = /^F[0-9A-Z]{9,}$/i;

const clean = (v) => {
  const s = String(v ?? '').trim();
  return s === '' || s === '#N/A' ? null : s;
};

export function legacyStatus(kamFeedbackStatus) {
  return kamFeedbackStatus === 'Resolved' ? 'Closed' : 'Open';
}

// raw: { id, timestamp (ISO with +06:00), email, requester (consignment or merchant, one column in the form),
//        channel, zone, hub, category, subCategory, details, kamName, week, priority, kamFeedback }
// hubNames: Set of hub_master.hub_name values.
// Returns { ok: true, esc } or { ok: false, reasons: [...] }.
export function mapLegacyRow(raw, hubNames, zoneTab) {
  const reasons = [];
  const id = String(raw.id || '').trim();
  if (!LEGACY_ID_RE.test(id)) reasons.push(`bad id ${id || '(blank)'}`);
  const zone = String(raw.zone || '').trim() === 'RSD' ? 'ISD' : String(raw.zone || '').trim();
  if (!['ISD', 'OSD', 'CTG'].includes(zone)) reasons.push(`zone ${raw.zone || '(blank)'}`);
  if (zoneTab && zone !== zoneTab) reasons.push(`zone ${zone} on ${zoneTab} tab`);
  if (id && zone && !id.startsWith(`OLD-${zone}-`)) reasons.push('id does not match zone');

  const ts = Date.parse(raw.timestamp || '');
  if (!Number.isFinite(ts)) reasons.push('bad timestamp');
  else if (ts < Date.parse(LEGACY_FROM_ISO)) reasons.push('before cut-off');

  const email = clean(raw.email);
  if (!email) reasons.push('no email');
  const requester = clean(raw.requester);
  if (!requester) reasons.push('no consignment/merchant');
  const channel = CH[String(raw.channel || '').trim()];
  if (!channel) reasons.push(`channel ${raw.channel || '(blank)'}`);
  const hub = String(raw.hub || '').trim();
  if (!hubNames || !hubNames.has(hub)) reasons.push(`hub '${hub}' not in hub_master`);
  const category = clean(raw.category);
  const subCategory = clean(raw.subCategory);
  if (!category || !subCategory) reasons.push('missing category/sub');
  const details = String(raw.details || '').trim();
  if (!details) reasons.push('empty details');
  const priority = PRI[String(raw.priority || '').trim()];
  if (priority === undefined) reasons.push(`priority ${raw.priority}`);
  const kfsRaw = String(raw.kamFeedback || '').trim();
  const kfs = KFS[kfsRaw];
  if (kfs === undefined) reasons.push(`kam feedback '${kfsRaw}'`);

  if (reasons.length) return { ok: false, reasons };

  const isConsignment = CONSIGNMENT_RE.test(requester);
  return {
    ok: true,
    esc: {
      issue_id: id,
      submitted_at: new Date(ts).toISOString(),
      feedback_due_at: new Date(ts + DAY_MS).toISOString(),
      email,
      consignment_id: isConsignment ? requester : null,
      merchant_name: isConsignment ? null : requester,
      channel,
      zone,
      concern_hub: hub,
      issue_status: legacyStatus(kfs),
      issue_category: category,
      issue_sub_category: subCategory,
      issue_details: details,
      kam_name: clean(raw.kamName),
      week: String(raw.week || '').trim(),
      priority_scale: priority,
      kam_feedback_status: kfs,
      // OLD sheet Comments 1 (Ops End) = Layer 1 (HUB Incharge); Comments 2 (Ops End) = Layer 2 (Cluster Lead)
      layer1_response: clean(raw.layer1),
      layer2_response: clean(raw.layer2),
    },
  };
}
