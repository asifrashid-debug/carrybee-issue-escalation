// App load test for the Tracker, Dashboard and Analytics pages. Plain Node 18+, no installs.
// Run on your PC against the TEST app only (never the live site). Usage:
//   BASE=http://localhost:3000 COOKIE='sb-ryfrkdmizlnshrlzioed-auth-token=...' CONC=10 REQS=100 node app-load.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
const COOKIE = process.env.COOKIE || '';
const CONC = Number(process.env.CONC || 10);
const REQS = Number(process.env.REQS || 100);
if (!COOKIE) { console.error('Set COOKIE to the signed-in browser cookie header (see instructions).'); process.exit(1); }
if (/supabase\.co|vercel\.app/.test(BASE)) { console.error('BASE must be the local test app, not a deployed site.'); process.exit(1); }

const PATHS = [
  ['/api/escalations', 'tracker list'],
  ['/api/analytics', 'dashboard and analytics data'],
  ['/api/masters', 'masters'],
  ['/dashboard', 'dashboard page'],
];

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

async function hit(path) {
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { headers: { cookie: COOKIE }, redirect: 'manual' });
    await r.arrayBuffer();
    return { ms: performance.now() - t, status: r.status };
  } catch (e) {
    return { ms: performance.now() - t, status: 'ERR' };
  }
}

for (const [path, label] of PATHS) {
  const results = [];
  let next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < REQS) { next++; results.push(await hit(path)); }
  }));
  const wall = (performance.now() - started) / 1000;
  const ok = results.filter((r) => r.status === 200);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const codes = {};
  for (const r of results) codes[r.status] = (codes[r.status] || 0) + 1;
  console.log(`\n${label}  ${path}  concurrency ${CONC}, ${REQS} requests`);
  console.log(`  statuses: ${JSON.stringify(codes)}`);
  if (times.length) console.log(`  200s: p50 ${pct(times, 50).toFixed(0)} ms | p95 ${pct(times, 95).toFixed(0)} ms | max ${times[times.length - 1].toFixed(0)} ms | ${(ok.length / wall).toFixed(1)} req/s`);
}
