'use client';
// Chart renderers ported from the approved demo (carrybee-final-demo.html: wave, bars, hbars, donut, gauge, legend).
// Same geometry and styling. Data comes only from live values passed in by the page; nothing is sample data.
// Classes are scoped under .dchart (see charts.css) so the rest of the app is not affected.
import { useId } from 'react';
import './charts.css';

const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
}

// Catmull-Rom through points, converted to cubic Bezier: a smooth wave line.
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// Wave chart: one or more smooth area/line series with gradient fills.
export function WaveChart({ labels = [], series = [], every = 1, w = 640, h = 230, label = 'Trend' }) {
  const uid = useId().replace(/:/g, '');
  if (!labels.length || !series.length) return <div className="empty">No data in this range</div>;
  const W = w;
  const H = h;
  const pl = 36;
  const pr = 12;
  const pt = 14;
  const pb = 26;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const all = series.flatMap((s) => s.data);
  const max = niceMax(Math.max(...all, 0));
  const n = labels.length;
  const x = (i) => pl + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pt + ih * (1 - v / max);
  const grid = [];
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4;
    const yy = y(v);
    grid.push(
      <g key={`g${k}`}>
        <line className="gl" x1={pl} x2={W - pr} y1={yy} y2={yy} />
        <text className="ax" x={pl - 8} y={yy + 4} textAnchor="end">{Math.round(v)}</text>
      </g>,
    );
  }
  const xl = labels.map((l, i) =>
    i % every === 0 || i === n - 1 ? (
      <text key={`x${i}`} className="ax" x={x(i)} y={H - 6} textAnchor="middle">{l}</text>
    ) : null,
  );
  const paths = [];
  const defs = [];
  series.forEach((s, si) => {
    const pts = s.data.map((v, i) => [x(i), y(v)]);
    const line = smooth(pts);
    const gid = `${uid}g${si}`;
    defs.push(
      <linearGradient key={gid} id={gid} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={s.color} stopOpacity={s.fillOpacity ?? 0.22} />
        <stop offset="1" stopColor={s.color} stopOpacity="0" />
      </linearGradient>,
    );
    if (s.fill !== false) {
      paths.push(<path key={`f${si}`} d={`${line} L${x(n - 1)},${pt + ih} L${x(0)},${pt + ih} Z`} fill={`url(#${gid})`} />);
    }
    paths.push(<path key={`l${si}`} d={line} fill="none" stroke={s.color} strokeWidth={s.width || 2.25} strokeLinecap="round" strokeLinejoin="round" />);
    const last = pts[pts.length - 1];
    paths.push(<circle key={`c${si}`} cx={last[0]} cy={last[1]} r="4.5" fill={s.color} className="dot-ring" strokeWidth="2" />);
  });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>{defs}</defs>
      {grid}
      {paths}
      {xl}
    </svg>
  );
}

// Vertical rounded bars with value labels.
export function BarChart({ items = [], w = 320, h = 200, label = 'Bar chart' }) {
  const W = w;
  const H = h;
  const pb = 28;
  const pt = 22;
  const ih = H - pb - pt;
  const max = niceMax(Math.max(...items.map((i) => i.value), 1));
  const n = items.length || 1;
  const gap = 16;
  const bw = (W - gap * (n + 1)) / n;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {items.map((it, i) => {
        const hh = (ih * it.value) / max;
        const xx = gap + i * (bw + gap);
        const yy = pt + ih - hh;
        const r = Math.max(0, Math.min(10, bw / 2, hh / 2));
        return (
          <g key={`${it.label}-${i}`}>
            {it.value > 0 && (
              <path
                d={`M${xx},${pt + ih} V${yy + r} Q${xx},${yy} ${xx + r},${yy} H${xx + bw - r} Q${xx + bw},${yy} ${xx + bw},${yy + r} V${pt + ih} Z`}
                fill={it.color}
              />
            )}
            <text className="val" x={xx + bw / 2} y={yy - 7} textAnchor="middle">{fmt(it.value)}</text>
            <text className="ax" x={xx + bw / 2} y={H - 8} textAnchor="middle">{it.label}</text>
          </g>
        );
      })}
      <line className="base" x1="0" x2={W} y1={pt + ih} y2={pt + ih} />
    </svg>
  );
}

// Horizontal bars (HTML): label, track, value.
export function HBars({ rows = [], color = '#111216', format = fmt }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <div className="empty">No data in this range</div>;
  return rows.map((r) => (
    <div className="hbar" key={r.label}>
      <span>{r.label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${((r.value / max) * 100).toFixed(1)}%`, background: r.color || color }} />
      </div>
      <b>{format(r.value)}</b>
    </div>
  ));
}

// Donut: ring with a centre label.
export function Donut({ segments = [], center, sub = '', size = 170, stroke = 20 }) {
  const S = size;
  const sw = stroke;
  const r = (S - sw) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, b) => a + (b.value || 0), 0) || 1;
  const gapPx = 3;
  let off = 0;
  const arcs = segments.map((seg, i) => {
    const len = (c * (seg.value || 0)) / total;
    const dash = Math.max(0, len - gapPx);
    const el = (
      <circle
        key={`${seg.label}-${i}`}
        cx={S / 2}
        cy={S / 2}
        r={r}
        fill="none"
        stroke={seg.color}
        strokeWidth={sw}
        strokeDasharray={`${dash.toFixed(2)} ${(c - dash).toFixed(2)}`}
        strokeDashoffset={(-off).toFixed(2)}
        transform={`rotate(-90 ${S / 2} ${S / 2})`}
      />
    );
    off += len;
    return el;
  });
  return (
    <div className="donut" style={{ width: S, height: S }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${center} ${sub}`}>
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" className="donut-track" strokeWidth={sw} />
        {arcs}
      </svg>
      <div className="dc">
        <b>{center}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

// Half gauge (0–100).
export function Gauge({ value, color, center, sub = '', w = 200 }) {
  const W = w;
  const R = W / 2 - 14;
  const cx = W / 2;
  const cy = W / 2;
  const t = Math.max(0, Math.min(100, value || 0)) / 100;
  const pnt = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  const start = pnt(Math.PI);
  const end = pnt(2 * Math.PI);
  const tip = pnt(Math.PI + Math.PI * t);
  const large = t > 0.5 ? 1 : 0;
  return (
    <svg className="gauge" viewBox={`0 0 ${W} ${W / 2 + 16}`} width="100%" role="img" aria-label={`${sub} ${center}`}>
      <path d={`M${start[0]},${start[1]} A${R},${R} 0 0 1 ${end[0]},${end[1]}`} fill="none" className="gauge-track" strokeWidth="14" strokeLinecap="round" />
      {t > 0 && (
        <path d={`M${start[0]},${start[1]} A${R},${R} 0 ${large} 1 ${tip[0]},${tip[1]}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      <text className="gv" x={cx} y={cy - 6} textAnchor="middle">{center}</text>
      <text className="ax" x={cx} y={cy + 12} textAnchor="middle">{sub}</text>
    </svg>
  );
}

// Legend: dot and label per series.
export function DLegend({ items = [] }) {
  return (
    <div className="dlegend">
      {items.map((i) => (
        <span key={i.l}>
          <i style={{ background: i.c }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

// Mini wave for KPI cards: no axes (demo spark).
export function Spark({ data = [], color = '#0A7A56' }) {
  if (!data || data.length < 2) return null;
  const W = 160;
  const H = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i * W) / (data.length - 1), 4 + (H - 8) * (1 - (v - min) / span)]);
  const d = smooth(pts);
  const uid = useId().replace(/:/g, '');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${uid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
