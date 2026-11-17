// Validation and row builders for the Admin & Masters "Add" forms (super admin only).
// Pure functions: no database or network, so the rules can be tested directly.
// Each builder returns the exact row to insert, or throws MasterInputError with a message for the user.

export class MasterInputError extends Error {}

export const ZONES = ['ISD', 'OSD', 'CTG'];
export const SIDES = ['requester', 'ops'];
export const ISSUE_TYPES = ['Critical', 'Urgent', 'Regular'];
// Same list as the users_roles CHECK constraint (migrations 001 and 004).
export const ROLES = ['requester', 'hub_ops', 'regional_lead', 'admin', 'management', 'team_lead', 'cm_lead', 'cm_member', 'mx'];
export const SLA_MIN = 1;
export const SLA_MAX = 10;

const SETTING_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const orNull = (v) => { const c = clean(v); return c === '' ? null : c; };

function required(v, label, max = 120) {
  const c = clean(v);
  if (!c) throw new MasterInputError(`${label} is required.`);
  if (c.length > max) throw new MasterInputError(`${label} is longer than ${max} characters.`);
  return c;
}

function slaDays(v, label) {
  const c = clean(v);
  if (c === '') return null;
  const n = Number(c);
  if (!Number.isInteger(n) || n < SLA_MIN || n > SLA_MAX) {
    throw new MasterInputError(`${label} must be a whole number of days from ${SLA_MIN} to ${SLA_MAX}, or blank.`);
  }
  return n;
}

// Hub Master. Division and regional lead are NOT NULL in hub_master, so they are required here.
export function buildHub(input = {}) {
  const zone = clean(input.zone);
  if (!ZONES.includes(zone)) throw new MasterInputError('Choose a zone (ISD, OSD or CTG).');
  return {
    hub_name: required(input.hub_name, 'Hub name'),
    zone,
    division: required(input.division, 'Division', 80),
    regional_lead: required(input.regional_lead, 'Regional lead', 120),
    cluster_lead: orNull(input.cluster_lead),
    is_active: true,
  };
}

// Category Master. Unique on (category, sub_category, side) in the database.
export function buildCategory(input = {}) {
  const side = clean(input.side) || 'requester';
  if (!SIDES.includes(side)) throw new MasterInputError('Side must be requester or ops.');
  const type = clean(input.issue_type);
  if (type && !ISSUE_TYPES.includes(type)) throw new MasterInputError('Issue type must be Critical, Urgent or Regular, or None.');
  return {
    category: required(input.category, 'Issue category'),
    sub_category: required(input.sub_category, 'Sub-category'),
    side,
    issue_type: type || null,
    sla_isd: slaDays(input.sla_isd, 'SLA days for ISD'),
    sla_osd: slaDays(input.sla_osd, 'SLA days for OSD'),
    sla_ctg: slaDays(input.sla_ctg, 'SLA days for CTG'),
    is_active: true,
  };
}

// Users & RBAC. Creating the row is what lets this Google account sign in with this role.
export function buildUser(input = {}) {
  const email = clean(input.email).toLowerCase();
  if (!email) throw new MasterInputError('Email is required.');
  if (!EMAIL_RE.test(email)) throw new MasterInputError('Email does not look valid.');
  const role = clean(input.role);
  if (!ROLES.includes(role)) throw new MasterInputError('Choose a valid role.');
  const teams = [...new Set(String(input.teams ?? '').split(',').map(clean).filter(Boolean))];
  const zone = clean(input.zone);
  if (zone && !ZONES.includes(zone)) throw new MasterInputError('Zone must be ISD, OSD or CTG, or None.');
  return {
    email,
    display_name: required(input.display_name, 'Name'),
    role,
    teams,
    zone: zone || null,
    region: null,
    is_active: true,
  };
}

// App settings (app_config). Value is JSON when it parses, otherwise stored as text.
export function buildSetting(input = {}) {
  const key = clean(input.key);
  if (!SETTING_KEY_RE.test(key)) throw new MasterInputError('Setting key: use lower-case letters, digits and underscores, starting with a letter (e.g. pick_hours).');
  const raw = String(input.value ?? '').trim();
  if (!raw) throw new MasterInputError('Value is required.');
  let value;
  try { value = JSON.parse(raw); } catch { value = raw; }
  return { key, value, description: orNull(input.description) };
}

// Human-readable key for the audit row and the success message.
export function entityKey(entity, row) {
  if (entity === 'hub') return row.hub_name;
  if (entity === 'category') return `${row.category} / ${row.sub_category} / ${row.side}`;
  if (entity === 'user') return row.email;
  if (entity === 'setting') return row.key;
  return '';
}

export const BUILDERS = { hub: buildHub, category: buildCategory, user: buildUser, setting: buildSetting };
export const TABLES = { hub: 'hub_master', category: 'category_master', user: 'users_roles', setting: 'app_config' };
