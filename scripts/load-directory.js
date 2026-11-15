// Loads data/hubs.json and data/categories.json into Supabase (idempotent).
// - hub_master: upsert all directory hubs (active); deactivate any other hub (demo hubs stay for FK history).
// - category_master (side=requester): deactivate old requester rows, upsert the directory list as active.
// Ops-side categories are not touched.
// Usage: node scripts/load-directory.js
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv(path.join(__dirname, '..', '.env.local'));
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const hubs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hubs.json'), 'utf8'));
  const cats = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'categories.json'), 'utf8'));

  // ---- hubs
  const hubRows = hubs.map(h => ({
    hub_name: h.hub_name, zone: h.zone, division: h.division, regional_lead: h.regional_lead,
    cluster_lead: h.cluster_lead, outbound_poc: h.outbound_poc, pickup_poc: h.pickup_poc, inbound_poc: h.inbound_poc,
    is_active: true
  }));
  for (let i = 0; i < hubRows.length; i += 100) {
    const { error } = await sb.from('hub_master').upsert(hubRows.slice(i, i + 100), { onConflict: 'hub_name' });
    if (error) throw new Error('hub upsert: ' + error.message);
  }
  const keep = new Set(hubRows.map(h => h.hub_name));
  const { data: allHubs, error: e1 } = await sb.from('hub_master').select('hub_name').eq('is_active', true);
  if (e1) throw new Error(e1.message);
  const toDeactivate = allHubs.map(h => h.hub_name).filter(n => !keep.has(n));
  if (toDeactivate.length) {
    const { error } = await sb.from('hub_master').update({ is_active: false }).in('hub_name', toDeactivate);
    if (error) throw new Error('hub deactivate: ' + error.message);
  }
  console.log(`hubs upserted: ${hubRows.length}, demo/other hubs deactivated: ${toDeactivate.length} -> ${toDeactivate.join(', ')}`);

  // ---- categories (requester side only)
  const { error: e2 } = await sb.from('category_master').update({ is_active: false }).eq('side', 'requester');
  if (e2) throw new Error('cat deactivate: ' + e2.message);
  const catRows = cats.map(c => ({
    category: c.category, sub_category: c.sub_category, side: 'requester', is_active: true,
    issue_type: c.issue_type, sla_isd: c.sla_isd, sla_osd: c.sla_osd, sla_ctg: c.sla_ctg
  }));
  for (let i = 0; i < catRows.length; i += 100) {
    const { error } = await sb.from('category_master').upsert(catRows.slice(i, i + 100), { onConflict: 'category,sub_category,side' });
    if (error) throw new Error('cat upsert: ' + error.message);
  }
  console.log(`requester categories upserted: ${catRows.length}`);

  // ---- verify
  const { count: hubActive } = await sb.from('hub_master').select('*', { count: 'exact', head: true }).eq('is_active', true);
  const { count: catActive } = await sb.from('category_master').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('side', 'requester');
  const { count: opsActive } = await sb.from('category_master').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('side', 'ops');
  console.log(`active now -> hubs: ${hubActive}, requester categories: ${catActive}, ops categories: ${opsActive}`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
