// Loads the business list (ID -> Merchant Name -> KAM) into business_master.
// Input: CSV exported from the "KAM Merchant List" tab. Headers are matched by name:
//   ID, Merchant Name, KAM   (other columns are ignored)
// Rules: blank KAM -> stored as null (the app then assigns 'CM'). First row wins for a duplicate ID.
// Businesses missing from the file are deactivated, so the file is the full list.
// Usage: node scripts/load-business.mjs <file.csv> [--dry-run]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dryRun = process.argv.includes('--dry-run');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) { console.error('Usage: node scripts/load-business.mjs <file.csv> [--dry-run]'); process.exit(1); }

function loadEnv(p) {
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

// Minimal RFC-4180 CSV parser (quoted fields, embedded commas and newlines).
function parseCsv(text) {
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
  return rows;
}

const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const table = parseCsv(text);
const header = table[0].map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
const iId = col('id'), iName = col('merchant name'), iKam = col('kam');
if (iId < 0 || iName < 0 || iKam < 0) {
  console.error(`Missing columns. Found headers: ${table[0].join(' | ')}`);
  process.exit(1);
}

const byId = new Map(); let blankId = 0, dupId = 0;
for (const r of table.slice(1)) {
  const id = (r[iId] || '').trim().replace(/,$/, '');
  const name = (r[iName] || '').trim().replace(/\s+/g, ' ');
  const kam = (r[iKam] || '').trim().replace(/\s+/g, ' ');
  if (!id || !name) { blankId++; continue; }
  if (byId.has(id)) { dupId++; continue; }
  byId.set(id, { business_id: id, business_name: name, kam_name: kam || null, is_active: true });
}
const rows = [...byId.values()];
const noKam = rows.filter((r) => !r.kam_name).length;
const nameCount = new Map();
for (const r of rows) nameCount.set(r.business_name.toLowerCase(), (nameCount.get(r.business_name.toLowerCase()) || 0) + 1);
const dupNames = [...nameCount.values()].filter((n) => n > 1).length;
console.log(`rows in file: ${table.length - 1}, usable: ${rows.length}, skipped (no ID or name): ${blankId}, duplicate IDs: ${dupId}`);
console.log(`no KAM (will be CM): ${noKam}, business names used more than once: ${dupNames}`);
if (dryRun) { console.log('dry run, nothing written'); process.exit(0); }

const env = loadEnv(path.join(root, '.env.local'));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
for (let i = 0; i < rows.length; i += 500) {
  const res = await fetch(`${URL}/rest/v1/business_master?on_conflict=business_id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.slice(i, i + 500)), cache: 'no-store',
  });
  if (!res.ok) { console.error('upsert failed', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
}
// Deactivate businesses that are no longer in the file (only if the file is non-empty).
if (rows.length) {
  const keep = new Set(rows.map((r) => r.business_id));
  const cur = await (await fetch(`${URL}/rest/v1/business_master?select=business_id&is_active=eq.true&limit=100000`, { headers: H, cache: 'no-store' })).json();
  const gone = cur.map((r) => r.business_id).filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 200) {
    const list = gone.slice(i, i + 200).map((id) => encodeURIComponent(id)).join(',');
    await fetch(`${URL}/rest/v1/business_master?business_id=in.(${list})`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ is_active: false }), cache: 'no-store',
    });
  }
  console.log(`deactivated: ${gone.length}`);
}
const total = await (await fetch(`${URL}/rest/v1/business_master?select=business_id&is_active=eq.true&limit=100000`, { headers: H, cache: 'no-store' })).json();
console.log(`active businesses now: ${total.length}`);
