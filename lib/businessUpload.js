// KAM funnel upload: parse a CSV or a Google Sheet tab, then plan a full-list replace of business_master.
// Pure functions only (no database or network), so the rules can be tested directly.
//
// Rules (agreed with the super admin):
// - Accepted headers: ID | business id, Merchant Name | business name, KAM | KAM name (case-insensitive).
// - ID keeps only letters, digits and hyphens (commas and stray characters are removed).
// - First row wins for a duplicate ID.
// - Blank KAM is stored as 'CM' (same as the lookup fallback in lib/business.js).
// - Merchants missing from the upload are deactivated and their KAM is set to 'CM'.
// - Refused when the upload has no usable rows, or when it would deactivate more than half of the active list
//   (unless the admin confirms).

export const CM_KAM = 'CM';
export const MAX_DEACTIVATE_SHARE = 0.5;

const ALIASES = {
  id: ['id', 'business id'],
  name: ['merchant name', 'business name'],
  kam: ['kam', 'kam name'],
};

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const cleanId = (v) => clean(v).replace(/[^A-Za-z0-9-]/g, '');

// Minimal RFC-4180 CSV parser (quoted fields, embedded commas and newlines).
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// table: array of rows, first row is the header. Returns raw records with cleaned fields.
export function tableToRecords(table) {
  if (!table || table.length === 0) throw new Error('The upload is empty.');
  const header = table[0].map((h) => clean(h).toLowerCase());
  const find = (names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const iId = find(ALIASES.id), iName = find(ALIASES.name), iKam = find(ALIASES.kam);
  if (iId < 0 || iName < 0 || iKam < 0) {
    throw new Error(`Missing columns. Need ID (or business id), Merchant Name (or business name) and KAM (or KAM name). Found: ${table[0].map(clean).join(' | ')}`);
  }
  const records = table.slice(1).map((r) => ({ id: cleanId(r[iId]), name: clean(r[iName]), kam: clean(r[iKam]) }));
  return { records, rowsInFile: records.length };
}

// Dedupe (first row wins) and fill the CM default. Returns the rows to load plus file statistics.
export function normalizeRecords(records) {
  const byId = new Map();
  let noIdOrName = 0, duplicateIds = 0, noKam = 0;
  for (const r of records) {
    if (!r.id || !r.name) { noIdOrName++; continue; }
    if (byId.has(r.id)) { duplicateIds++; continue; }
    if (!r.kam) noKam++;
    byId.set(r.id, { business_id: r.id, business_name: r.name, kam_name: r.kam || CM_KAM });
  }
  const rows = [...byId.values()];
  return {
    rows,
    stats: { rowsInFile: records.length, usable: rows.length, skippedNoIdOrName: noIdOrName, duplicateIds, noKam },
  };
}

// current: business_master rows as [{ business_id, business_name, kam_name, is_active }].
// incoming: normalized rows. Returns the upserts, the audit changes and the counts.
export function planReplace(current, incoming) {
  const cur = new Map(current.map((r) => [r.business_id, r]));
  const inc = new Set(incoming.map((r) => r.business_id));
  const upserts = [];
  const changes = [];
  const counts = { added: 0, kamChanged: 0, nameChanged: 0, reactivated: 0, deactivated: 0, resetToCm: 0 };

  for (const r of incoming) {
    const c = cur.get(r.business_id);
    if (!c) {
      counts.added++;
      upserts.push({ ...r, is_active: true });
      changes.push({ business_id: r.business_id, field_name: 'added', old_value: null, new_value: `${r.business_name} | KAM ${r.kam_name}` });
      continue;
    }
    const diffs = [];
    if ((c.business_name || '') !== r.business_name) { diffs.push(['business_name', c.business_name, r.business_name]); counts.nameChanged++; }
    if ((c.kam_name || '') !== r.kam_name) { diffs.push(['kam_name', c.kam_name, r.kam_name]); counts.kamChanged++; }
    if (c.is_active === false) { diffs.push(['is_active', 'false', 'true']); counts.reactivated++; }
    if (diffs.length) {
      upserts.push({ ...r, is_active: true });
      for (const [field_name, o, n] of diffs) changes.push({ business_id: r.business_id, field_name, old_value: o ?? null, new_value: n });
    }
  }

  for (const c of current) {
    if (inc.has(c.business_id)) continue;
    const diffs = [];
    if (c.is_active !== false) { diffs.push(['is_active', 'true', 'false']); counts.deactivated++; }
    if ((c.kam_name || '') !== CM_KAM) { diffs.push(['kam_name', c.kam_name, CM_KAM]); counts.resetToCm++; }
    if (diffs.length) {
      upserts.push({ business_id: c.business_id, business_name: c.business_name, kam_name: CM_KAM, is_active: false });
      for (const [field_name, o, n] of diffs) changes.push({ business_id: c.business_id, field_name, old_value: o ?? null, new_value: n });
    }
  }

  const activeBefore = current.filter((c) => c.is_active !== false).length;
  return { upserts, changes, counts: { ...counts, upserted: upserts.length, activeBefore, activeAfter: incoming.length } };
}

// Returns null when the plan may be applied, otherwise a message explaining why it is blocked.
export function blockReason(plan, { confirmLarge = false } = {}) {
  if (plan.counts.activeAfter === 0) return 'The upload has no usable merchants. Nothing was changed.';
  const { deactivated, activeBefore } = plan.counts;
  if (activeBefore > 0 && deactivated / activeBefore > MAX_DEACTIVATE_SHARE && !confirmLarge) {
    return `This upload would deactivate ${deactivated} of ${activeBefore} active merchants (more than half). Confirm to apply anyway.`;
  }
  return null;
}

// Accepts a full Google Sheets URL or a bare spreadsheet ID. Returns the ID or null.
export function sheetIdFromInput(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9-_]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9-_]{20,}$/.test(s)) return s;
  return null;
}
