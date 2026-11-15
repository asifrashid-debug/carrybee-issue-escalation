// Sample dataset for previews only (?sample=1). Never written to the DB.
const USERS = [
  { email: 'akash.saha@carrybee.com', display_name: 'Akash Saha', role: 'team_lead', teams: ['KAM'] },
  { email: 'md.istiaque@carrybee.com', display_name: 'Md. Istiaque Ahamed', role: 'requester', teams: ['KAM'] },
  { email: 'anik.ahamed@carrybee.com', display_name: 'Md. Anik Ahamed', role: 'requester', teams: ['KAM'] },
  { email: 'jaber.aunto@carrybee.com', display_name: 'Jaber Al Aunto', role: 'requester', teams: ['KAM'] },
  { email: 'shohanur.shuvo@carrybee.com', display_name: 'Shohanur Rahman Shuvo', role: 'team_lead', teams: ['OSD'] },
  { email: 'sm.shihab@carrybee.com', display_name: 'S. M Shihab', role: 'requester', teams: ['OSD'] },
  { email: 'anam.apurbo@carrybee.com', display_name: 'Anam Ahammad Apurbo', role: 'requester', teams: ['OSD'] },
  { email: 'raian.rudra@carrybee.com', display_name: 'Raian Islam Rudra', role: 'team_lead', teams: ['ISD'] },
  { email: 'rizvi.chy@carrybee.com', display_name: 'Rizvi Ahmed Chowdhury', role: 'requester', teams: ['ISD'] },
  { email: 'sohel.rana@carrybee.com', display_name: 'Md. Sohel Rana', role: 'requester', teams: ['ISD'] },
  { email: 'asif.rayhan@carrybee.com', display_name: 'Md. Asif Rayhan', role: 'team_lead', teams: ['Corporate'] },
  { email: 'tanvir.ahmmed@carrybee.com', display_name: 'Tanvir Ahmmed', role: 'requester', teams: ['Corporate'] },
  { email: 'ibrahim.mojumder@carrybee.com', display_name: 'Md Ibrahim Mojumder', role: 'team_lead', teams: ['SUB'] },
  { email: 'md.udoye@carrybee.com', display_name: 'Md Mahbubur Rahman Udoy', role: 'requester', teams: ['SUB'] },
  { email: 'sufian.ahmed@carrybee.com', display_name: 'Sufian Ahmed', role: 'team_lead', teams: ['Activation', 'IB'] },
  { email: 'mahmudul.hasan@carrybee.com', display_name: 'Md. Mahmudul Hasan', role: 'requester', teams: ['Activation'] },
  { email: 'sazzad.haider@carrybee.com', display_name: 'Mohammad Sazzad Haider', role: 'requester', teams: ['Activation'] },
  { email: 'foysal.tamim@carrybee.com', display_name: 'Md. Foysal Hossain Tamim', role: 'mx', teams: ['IB'] },
  { email: 'rakib.c@carrybee.com', display_name: 'MD Rakib Chowdhury', role: 'mx', teams: ['IB'] },
  { email: 'asif.rashid@carrybee.com', display_name: 'Ahmed Asif Rashid', role: 'cm_lead', teams: ['CM'] },
  { email: 'iniat.islam@carrybee.com', display_name: 'Tanzim Iniat Islam', role: 'cm_member', teams: ['CM'] },
];

// Small deterministic PRNG so the preview is stable between reloads.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function sampleData({ hubsJson, categoriesJson, now = new Date() }) {
  const rand = rng(20261114);
  const hubs = hubsJson.map((h) => ({ hub_name: h.hub_name, zone: h.zone, division: h.division, regional_lead: h.regional_lead, cluster_lead: h.cluster_lead }));
  const cats = categoriesJson.map((c) => c.category);
  const uniqCats = [...new Set(cats)].slice(0, 14);
  const pool = hubs.filter((h) => ['ISD', 'OSD', 'CTG'].includes(h.zone));
  const kamLike = USERS.filter((u) => u.role !== 'mx' && u.role !== 'cm_lead' && u.role !== 'cm_member');
  const mxLike = USERS.filter((u) => u.role === 'mx' || u.role === 'cm_lead' || u.role === 'cm_member');
  // Spread across all three zones: every 4th hub, with the first 12 weighted as busiest.
  const top = pool.filter((_, i) => i % 4 === 0);
  const escalations = [];
  const N = 420;
  const nowMs = now.getTime();
  for (let i = 0; i < N; i++) {
    const hub = rand() < 0.6 ? top[Math.floor(rand() * Math.min(12, top.length))] : top[Math.floor(rand() * top.length)];
    const isMx = rand() < 0.2;
    const who = isMx ? mxLike[Math.floor(rand() * mxLike.length)] : kamLike[Math.floor(rand() * kamLike.length)];
    const submitted = nowMs - Math.floor(rand() * 14 * 86400000);
    const pickAfter = rand() < 0.08 ? null : rand() * 9 * 3600000;
    const pickMs = pickAfter == null ? null : submitted + pickAfter;
    const respAfter = pickMs && rand() < 0.85 ? rand() * 40 * 3600000 : null;
    const respMs = respAfter == null ? null : submitted + respAfter;
    const resolved = respMs && rand() < 0.55;
    const closed = resolved && rand() < 0.5;
    const priority = rand() < 0.12 ? 'P1' : rand() < 0.5 ? 'P2' : rand() < 0.7 ? 'P3' : 'P4';
    const statuses = ['New', 'Picked', 'In Progress', 'On Hold', 'Resolved', 'Unresolved'];
    const ops = resolved ? 'Resolved' : pickMs ? (rand() < 0.5 ? 'In Progress' : statuses[Math.floor(rand() * 3) + 1]) : 'New';
    escalations.push({
      issue_id: `SAMPLE-${String(i + 1).padStart(4, '0')}`,
      submitted_at: new Date(submitted).toISOString(),
      email: who.email,
      channel: isMx ? 'MX' : 'KAM',
      zone: hub.zone,
      concern_hub: hub.hub_name,
      division: hub.division,
      issue_status: closed ? 'Closed' : 'Open',
      issue_category: uniqCats[Math.floor(rand() * uniqCats.length)],
      priority_scale: priority,
      issue_pick_time: pickMs ? new Date(pickMs).toISOString() : null,
      issue_response_datetime: respMs ? new Date(respMs).toISOString() : null,
      ops_issue_status: ops,
      regional_lead: hub.regional_lead,
      is_archived: false,
    });
  }
  return { escalations, users: USERS, hubs, now };
}
