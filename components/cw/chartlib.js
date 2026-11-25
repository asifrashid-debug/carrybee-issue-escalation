// Ported from carrybee-complete-web.html (helpers, charts, icons, brand). Markup is generated exactly as in the demo. Sample arrays are NOT included; pages pass live data in.
/* ---------- Brand tokens (from the CarryBee 3D design system file) ---------- */
const BRAND = {
  bee:'#FFCC00', beeLight:'#FDE68A', ink:'#08090B',
  mint:'#00E5A0', flare:'#FF5470', azure:'#37A9FF', violet:'#A78BFA'
};
const ZONE = {ISD:BRAND.bee, OSD:BRAND.azure, CTG:BRAND.violet};
const PRIO = {Urgent:BRAND.flare, Critical:BRAND.bee, Regular:BRAND.mint};
/* ---------- Helpers ---------- */
let SEQ = 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => Number(n).toLocaleString('en-US');
function niceMax(v){ if(!(v>0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v/p)*p; }

/* Catmull-Rom through points, converted to cubic Bezier: a smooth "wave" line */
function smooth(pts, lo, hi){
  if(pts.length < 2) return '';
  // Control points are clamped to the plot box. A Bezier stays inside the hull of its points,
  // so the line can no longer dip below the zero baseline between two zero values.
  const cl = v => (lo == null ? v : Math.min(hi, Math.max(lo, v)));
  let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for(let i = 0; i < pts.length - 1; i++){
    const p0 = pts[i-1] || pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2] || p2;
    const c1x = p1[0] + (p2[0]-p0[0])/6, c1y = cl(p1[1] + (p2[1]-p0[1])/6);
    const c2x = p2[0] - (p3[0]-p1[0])/6, c2y = cl(p2[1] - (p3[1]-p1[1])/6);
    d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  }
  return d;
}

/* Wave chart: one or more smooth area/line series with gradient fills */
function wave(o){
  const W = o.w || 640, H = o.h || 230, pl = 36, pr = 12, pt = 14, pb = 26;
  const iw = W - pl - pr, ih = H - pt - pb;
  const all = o.series.flatMap(s => s.data);
  const max = niceMax(Math.max(...all));
  const n = o.labels.length;
  const x = i => pl + (n === 1 ? iw/2 : i * iw / (n - 1));
  const y = v => pt + ih * (1 - v / max);
  const id = 'w' + (++SEQ);
  let g = '';
  for(let k = 0; k <= 4; k++){
    const v = max * k / 4, yy = y(v);
    g += '<line class="gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '"/>';
    g += '<text class="ax" x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + Math.round(v) + '</text>';
  }
  let xl = '';
  o.labels.forEach((l, i) => {
    if(i % (o.every || 1) === 0 || i === n - 1) xl += '<text class="ax" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l) + '</text>';
  });
  let paths = '', defs = '';
  o.series.forEach((s, si) => {
    const pts = s.data.map((v, i) => [x(i), y(v)]);
    const line = smooth(pts, pt, pt + ih);
    const gid = id + 'g' + si;
    defs += '<linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity="' + (s.fillOpacity ?? 0.22) + '"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient>';
    if(s.fill !== false) paths += '<path d="' + line + ' L' + x(n-1) + ',' + (pt + ih) + ' L' + x(0) + ',' + (pt + ih) + ' Z" fill="url(#' + gid + ')"/>';
    paths += '<path d="' + line + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.width || 2.25) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    const last = pts[pts.length - 1];
    paths += '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="4.5" fill="' + s.color + '" stroke="' + (o.bg || '#fff') + '" stroke-width="2"/>';
  });
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Trend') + '"><defs>' + defs + '</defs>' + g + paths + xl + '</svg>';
}

/* Mini wave for KPI cards: no axes */
function spark(data, color){
  const W = 160, H = 40;
  const max = Math.max(...data), min = Math.min(...data), span = (max - min) || 1;
  const pts = data.map((v, i) => [i * W / (data.length - 1), 4 + (H - 8) * (1 - (v - min) / span)]);
  const d = smooth(pts, 4, H - 4);
  const id = 's' + (++SEQ);
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".25"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs><path d="' + d + ' L' + W + ',' + H + ' L0,' + H + ' Z" fill="url(#' + id + ')"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
}

/* Vertical rounded bars */
function bars(o){
  const W = o.w || 320, H = o.h || 200, pb = 28, pt = 22;
  const ih = H - pb - pt;
  const max = niceMax(Math.max(...o.items.map(i => i.value), 1));
  const n = o.items.length, gap = 16, bw = (W - gap * (n + 1)) / n;
  let s = '';
  o.items.forEach((it, i) => {
    const h = ih * it.value / max, x = gap + i * (bw + gap), y = pt + ih - h;
    if(it.value > 0){
      const r = Math.max(0, Math.min(10, bw/2, h/2));
      s += '<path d="M' + x + ',' + (pt + ih) + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' H' + (x + bw - r) + ' Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + ' V' + (pt + ih) + ' Z" fill="' + it.color + '"/>';
    }
    s += '<text class="val" x="' + (x + bw/2) + '" y="' + (y - 7) + '" text-anchor="middle">' + fmt(it.value) + '</text>';
    s += '<text class="ax" x="' + (x + bw/2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(it.label) + '</text>';
  });
  s += '<line class="base" x1="0" x2="' + W + '" y1="' + (pt + ih) + '" y2="' + (pt + ih) + '"/>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart">' + s + '</svg>';
}

/* Horizontal bars (HTML) */
function hbars(rows, color){
  const max = Math.max(...rows.map(r => r.value), 1);
  return rows.map(r => '<div class="hbar"><span>' + esc(r.label) + '</span><div class="track"><div class="fill" style="width:' + (r.value / max * 100).toFixed(1) + '%;background:' + (r.color || color) + '"></div></div><b>' + fmt(r.value) + '</b></div>').join('');
}

/* Donut: ring with centre label */
function donut(o){
  const S = o.size || 170, sw = o.stroke || 20, r = (S - sw) / 2, c = 2 * Math.PI * r;
  const total = o.segments.reduce((a, b) => a + b.value, 0) || 1;
  const gapPx = o.gap == null ? 3 : o.gap;
  let off = 0, arcs = '';
  o.segments.forEach(seg => {
    const len = c * seg.value / total;
    const dash = Math.max(0, len - gapPx);
    arcs += '<circle cx="' + S/2 + '" cy="' + S/2 + '" r="' + r + '" fill="none" stroke="' + seg.color + '" stroke-width="' + sw + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + (c - dash).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + S/2 + ' ' + S/2 + ')"/>';
    off += len;
  });
  const track = '<circle cx="' + S/2 + '" cy="' + S/2 + '" r="' + r + '" fill="none" stroke="' + (o.track || 'rgba(128,128,128,.12)') + '" stroke-width="' + sw + '"/>';
  return '<div class="donut" style="width:' + S + 'px;height:' + S + 'px"><svg width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="' + esc(o.center) + ' ' + esc(o.sub || '') + '">' + track + arcs + '</svg><div class="dc"><b>' + esc(o.center) + '</b><span>' + esc(o.sub || '') + '</span></div></div>';
}

/* Pie: solid slices */
function pie(o){
  const S = o.size || 170, cx = S/2, cy = S/2, R = S/2 - 3;
  const sum = o.segments.reduce((a, b) => a + b.value, 0);
  if (!(sum > 0)) return '<svg class="pie" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Pie chart, no data"><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + (o.track || 'var(--track)') + '"/></svg>';
  const total = sum;
  let a = -Math.PI/2, s = '';
  o.segments.forEach(seg => {
    const ang = 2 * Math.PI * seg.value / total;
    if(ang <= 0) return;
    if(ang >= 2 * Math.PI - 1e-6){ s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + seg.color + '"/>'; return; }
    const a2 = a + ang, large = ang > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a), x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
    s += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' + seg.color + '" stroke="' + (o.bg || '#fff') + '" stroke-width="2"/>';
    a = a2;
  });
  return '<svg class="pie" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Pie chart">' + s + '</svg>';
}

/* Half gauge (0–100) */
function gauge(o){
  const W = o.w || 200, R = W/2 - 14, cx = W/2, cy = W/2;
  const t = Math.max(0, Math.min(100, o.value)) / 100;
  const pnt = a => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  const start = pnt(Math.PI), end = pnt(2 * Math.PI);
  const endAng = Math.PI + Math.PI * t, tip = pnt(endAng);
  const large = t > 0.5 ? 1 : 0;
  return '<svg class="gauge" viewBox="0 0 ' + W + ' ' + (W/2 + 16) + '" width="' + W + '" role="img" aria-label="' + esc(o.label || 'Gauge') + ' ' + esc(o.center) + '">' +
    '<path d="M' + start[0] + ',' + start[1] + ' A' + R + ',' + R + ' 0 0 1 ' + end[0] + ',' + end[1] + '" fill="none" stroke="' + (o.track || 'rgba(128,128,128,.14)') + '" stroke-width="14" stroke-linecap="round"/>' +
    (t > 0 ? '<path d="M' + start[0] + ',' + start[1] + ' A' + R + ',' + R + ' 0 0 1 ' + tip[0] + ',' + tip[1] + '" fill="none" stroke="' + o.color + '" stroke-width="14" stroke-linecap="round"/>' : '') +
    '<text class="gv" x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle">' + esc(o.center) + '</text>' +
    '<text class="ax" x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle">' + esc(o.sub || '') + '</text></svg>';
}

/* Stacked horizontal bar with legend */
function stackbar(items){
  const tot = items.reduce((a, b) => a + b.value, 0) || 1;
  return '<div class="stackbar">' + items.map(i => '<i style="width:' + (i.value / tot * 100).toFixed(2) + '%;background:' + i.color + '" title="' + esc(i.label) + ' ' + i.value + '"></i>').join('') + '</div>' +
    '<div class="legend" style="margin-top:12px">' + items.map(i => '<span><i style="background:' + i.color + '"></i>' + esc(i.label) + ' ' + fmt(i.value) + '</span>').join('') + '</div>';
}

function legend(items){ return '<div class="legend">' + items.map(i => '<span><i style="background:' + i.c + '"></i>' + esc(i.l) + '</span>').join('') + '</div>'; }

/* ---------- Icons: 24px grid, 1.75 stroke, round caps, one bee-yellow "signature" dot top-right ---------- */
const ICONS = [
  {n:'escalation', t:'Escalation', u:'Issue raised, level climbs', p:'<path d="M4 19h3v-3h3v-3h3v-3h3"/><path d="M13.5 4.5H17v3.5"/>'},
  {n:'hub', t:'Hub', u:'Hub response and pick', p:'<path d="M4 10.5 11 5l7 5.5V19H4z"/><path d="M9.5 19v-4.5h3V19"/>'},
  {n:'pick', t:'Pick', u:'Parcel picked up', p:'<path d="M4 8.5 11 5l7 3.5v7L11 19l-7-3.5z"/><path d="M4 8.5l7 3.5 7-3.5M11 12v7"/>'},
  {n:'sla', t:'SLA timer', u:'Pick and comment deadlines', p:'<circle cx="11" cy="12.5" r="6.5"/><path d="M11 9v3.8l2.4 1.4"/>'},
  {n:'breach', t:'Breach flag', u:'SLA breached', p:'<path d="M6 20V4.5"/><path d="M6 5h9l-2.2 3.2L15 11.5H6"/>'},
  {n:'merchant', t:'Merchant', u:'Store or merchant', p:'<path d="M5 11v8h14v-8"/><path d="M4 9.5 5.5 5h12L19 9.5a2.8 2.8 0 0 1-5.4 0 2.8 2.8 0 0 1-5.2 0A2.8 2.8 0 0 1 4 9.5z"/><path d="M10 19v-4h4v4"/>'},
  {n:'parcel', t:'Consignment', u:'Consignment ID and parcel', p:'<path d="M5 9.5h14V19H5z"/><path d="M12 9.5V19"/><path d="M8.5 6h7l1 3.5h-9z"/>'},
  {n:'feedback', t:'Feedback', u:'KAM feedback and outcome', p:'<path d="M5 6h14v9h-7.5L8 18.2V15H5z"/><path d="m9 10.5 2 2 3.6-3.6"/>'},
  {n:'followup', t:'Follow-up', u:'CM follow-ups 1st to 3rd', p:'<path d="M5 17c0-6 4-9 10-9h2"/><path d="m14 4.5 3 3.5-3 3.5"/>'},
  {n:'layers', t:'Response layers', u:'Layers 1 to 3', p:'<path d="M11 4.5 18 8l-7 3.5L4 8z"/><path d="m4 12 7 3.5 7-3.5"/><path d="m4 16 7 3.5 7-3.5"/>'},
  {n:'audit', t:'Audit log', u:'Action log entries', p:'<path d="M7 4h10v16H7z"/><path d="M10 9h4M10 12.5h4M10 16h2.4"/>'},
  {n:'sync', t:'Sheet sync', u:'Sync health and reconcile', p:'<path d="M5 12a7 7 0 0 1 12.2-4.7"/><path d="M17.5 4.5v3.2h-3.2"/><path d="M19 12a7 7 0 0 1-12.2 4.7"/><path d="M6.5 19.5v-3.2h3.2"/>'},
  {n:'zone', t:'Zone pin', u:'ISD, OSD, CTG zones', p:'<path d="M11 19.5s-6-5.2-6-9.5a6 6 0 0 1 12 0c0 4.3-6 9.5-6 9.5z"/><circle cx="11" cy="10" r="2.2"/>'},
  {n:'team', t:'Team', u:'Team performance', p:'<circle cx="9" cy="8.5" r="3"/><path d="M4 19c.6-3 2.6-4.5 5-4.5s4.4 1.5 5 4.5"/><path d="M15.5 6a2.5 2.5 0 0 1 0 5"/><path d="M17 14.5c1.5.5 2.4 2 2.7 4.5"/>'},
  {n:'kam', t:'Account manager', u:'KAM contact and calls', p:'<path d="M5 13.5v-1a7 7 0 0 1 14 0v1"/><path d="M5 13.5h3v5H5z"/><path d="M16 13.5h3v5h-3"/><path d="M16 18.5c0 .9-1.5 1.5-4 1.5"/>'},
  {n:'mx', t:'MX toolkit', u:'MX form and fixes', p:'<path d="M14.5 5.5a4 4 0 0 0-5 5.2L4.5 15.7a1.8 1.8 0 0 0 2.6 2.6l5-5a4 4 0 0 0 5.2-5l-2.4 2.4-2.2-.6-.6-2.2z"/>'},
  {n:'resolved', t:'Resolved', u:'Closed and verified', p:'<path d="M11 4.5 17 7v4.8c0 3.7-2.6 6.2-6 7.7-3.4-1.5-6-4-6-7.7V7z"/><path d="m8.4 12 1.9 1.9 3.6-3.7"/>'},
  {n:'priority', t:'Priority mix', u:'Urgent, critical, regular', p:'<path d="M5 19v-3"/><path d="M9.5 19v-6"/><path d="M14 19V9"/><path d="M18.5 19V5"/>'},
  {n:'category', t:'Category', u:'Issue category tag', p:'<path d="M4 12.5V5.5a1 1 0 0 1 1-1h7l7.5 7.5-8 8z"/><circle cx="8.5" cy="8.5" r="1.4"/>'},
  {n:'ir', t:'Issue resolution', u:'IR escalations and resolution', p:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m14.6 14.6 4.4 4.4"/><path d="M8 10.5h5"/>'},
  {n:'trend', t:'Trend wave', u:'Flow and trend charts', p:'<path d="M3 13c2.2-3.2 4.3-3.2 6 0s3.8 3.2 6 0 3.6-3.2 6 0"/>'}
];

function sprite(){
  const syms = ICONS.map(i => '<symbol id="i-' + i.n + '" viewBox="0 0 24 24">' + i.p + '<circle cx="19.5" cy="4.5" r="1.9" fill="' + BRAND.bee + '" stroke="none"/></symbol>').join('');
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + syms + '</defs></svg>';
}
function ic(name, cls){ return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }

/* ---------- Shared blocks ---------- */
function prioPill(p){ const c = {Urgent:'p-urg', Critical:'p-crit', Regular:'p-reg'}[p] || 'p-res'; return '<span class="pill ' + c + '">' + esc(p) + '</span>'; }
function statusPill(st, s){ const c = {breach:'p-breach', ok:'p-ok', wait:'p-wait', res:'p-res'}[st] || 'p-res'; return '<span class="pill ' + c + '">' + esc(s) + '</span>'; }
function pageHead(kicker, title, sub, right){
  return '<div class="ph"><div><div class="kicker">' + esc(kicker) + '</div><h1>' + esc(title) + '</h1><p class="sub">' + esc(sub) + '</p></div>' + (right || '') + '</div>';
}
const SEG = '<div class="seg"><span class="on">7 days</span><span>14 days</span><span>30 days</span></div>';
function mins(t){ const h=/(\d+)h/.exec(t), m=/(\d+)m/.exec(t); return (h ? +h[1]*60 : 0) + (m ? +m[1] : 0); }

/* A-style KPI strip for any list of KPIs */
function kpiStrip(list){
  return '<div class="kpis' + (list.length === 5 ? ' k5' : '') + '">' + list.map(k => '<div class="kpi"><div class="lab">' + ic(k.icon) + esc(k.label) + '</div><div class="num">' + esc(k.value) + '</div>' + (k.delta ? '<div class="delta ' + (k.good ? 'good' : 'bad') + '">' + esc(k.delta) + '</div>' : '<div class="delta muted">' + esc(k.sub || '') + '</div>') + (k.spark ? spark(k.spark, k.good === false ? BRAND.flare : '#0A7A56') : '') + '</div>').join('') + '</div>';
}

function statusDot(st){ const c = {ok:'#00C98D', wait:BRAND.azure, breach:BRAND.flare, res:'#A3A9B3'}[st] || '#A3A9B3'; return '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + ';margin-right:8px;vertical-align:1px"></i>'; }
function gradePill(g){ const c = {A:'#CFF8E9;color:#0A7A56', B:'#FFF3C2;color:#7A5B00', C:'#FFE6D6;color:#9A4A00', D:'#FFE4E9;color:#C81E3F'}[g]; return '<span class="pill" style="background:' + c + '">' + g + '</span>'; }
function sbar(pct, color){ return '<div class="bar" style="width:120px;height:6px;border-radius:99px;background:var(--track);overflow:hidden"><i style="display:block;height:100%;width:' + pct + '%;background:' + color + ';border-radius:99px"></i></div>'; }
function modeSeg(){ return '<div class="seg" role="group" aria-label="View mode"><span class="on" data-mode="desk">Desktop</span><span data-mode="phone">Phone summary</span></div>'; }
function rangeSeg(){ return '<div class="seg"><span class="on">7 days</span><span>14 days</span><span>30 days</span></div>'; }
export { BRAND, ZONE, PRIO, esc, fmt, niceMax, smooth, wave, spark, bars, hbars, donut, pie, gauge, stackbar, legend, ICONS, sprite, ic, prioPill, statusPill, pageHead, mins, kpiStrip, statusDot, gradePill, sbar, modeSeg, rangeSeg, SEG };
