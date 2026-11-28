// MX API: pure rules (no database). Used by app/api/mx/issues and lib/mxIntake.js.
// The MX CRM sends issues here. Every issue from this API goes to the HUB route (route_hub = true, always).
// IR, Central Sort and TNL are never set by the API. Any route_* field in the body is ignored.
import { createHash, timingSafeEqual } from 'node:crypto';

export const MX_ROUTES = Object.freeze({ hub: true, ir: false, central_sort: false, tnl: false });

export const MX_LIMITS = Object.freeze({
  externalId: 100,
  email: 254,
  consignmentMin: 6,
  consignment: 30,
  merchant: 200,
  hub: 100,
  category: 200,
  details: 2000,
  detailsMin: 20,
});

const EXTERNAL_ID_RE = /^[A-Za-z0-9._:-]+$/;      // the MX CRM's own reference: letters, digits, . _ : -
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSIGNMENT_RE = /^[A-Za-z0-9-]{6,30}$/;     // same rule as the database (app_config.validation.consignment_id_regex, checked after uppercasing)

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Checks the body and returns the cleaned values, or the list of problems (field + message).
export function validateMxIssue(body) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'Body must be a JSON object.' }] };
  }

  const external_id = str(body.external_id);
  if (!external_id) add('external_id', 'Required: the MX CRM reference for this issue.');
  else if (external_id.length > MX_LIMITS.externalId || !EXTERNAL_ID_RE.test(external_id)) {
    add('external_id', `Use letters, digits and . _ : - only (up to ${MX_LIMITS.externalId} characters).`);
  }

  const reporter_email = str(body.reporter_email).toLowerCase();
  if (!reporter_email) add('reporter_email', 'Required: the MX team member who raised the issue.');
  else if (reporter_email.length > MX_LIMITS.email || !EMAIL_RE.test(reporter_email)) add('reporter_email', 'Must be a valid email address.');

  const consignment_id = str(body.consignment_id);
  if (consignment_id && !CONSIGNMENT_RE.test(consignment_id)) {
    add('consignment_id', `Use 6 to ${MX_LIMITS.consignment} letters, digits or dashes (no spaces or underscores).`);
  }

  const merchant_name = str(body.merchant_name).replace(/\s+/g, ' ');
  if (merchant_name.length > MX_LIMITS.merchant) add('merchant_name', `Up to ${MX_LIMITS.merchant} characters.`);
  if (!consignment_id && !merchant_name) add('consignment_id', 'Give a consignment_id or a merchant_name (at least one).');

  const concern_hub = str(body.concern_hub);
  if (!concern_hub) add('concern_hub', 'Required: the hub name exactly as in Hub Master.');
  else if (concern_hub.length > MX_LIMITS.hub) add('concern_hub', `Up to ${MX_LIMITS.hub} characters.`);

  const issue_category = str(body.issue_category);
  if (!issue_category) add('issue_category', 'Required.');
  else if (issue_category.length > MX_LIMITS.category) add('issue_category', `Up to ${MX_LIMITS.category} characters.`);

  const issue_sub_category = str(body.issue_sub_category);
  if (!issue_sub_category) add('issue_sub_category', 'Required.');
  else if (issue_sub_category.length > MX_LIMITS.category) add('issue_sub_category', `Up to ${MX_LIMITS.category} characters.`);

  const issue_details = str(body.issue_details);
  if (issue_details.length < MX_LIMITS.detailsMin) add('issue_details', `At least ${MX_LIMITS.detailsMin} characters.`);
  else if (issue_details.length > MX_LIMITS.details) add('issue_details', `At most ${MX_LIMITS.details} characters.`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    clean: { external_id, reporter_email, consignment_id: consignment_id || null, merchant_name: merchant_name || null,
      concern_hub, issue_category, issue_sub_category, issue_details },
  };
}

// Stable fingerprint of the cleaned request. Same external_id with a different fingerprint is a conflict.
export function requestHash(clean) {
  const keys = Object.keys(clean).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, clean[k]]));
  return createHash('sha256').update(canonical).digest('hex');
}

// Reads "Bearer <key>" from the Authorization header.
export function bearerToken(header) {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || '').trim());
  return m ? m[1].trim() : '';
}

// Constant-time comparison. If no key is configured, nothing is accepted.
export function apiKeyOk(given, expected) {
  if (!expected || !given) return false;
  const a = createHash('sha256').update(String(given)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}
