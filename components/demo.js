'use client';
import { useId } from 'react';
import { Spark } from './charts';

// Shared building blocks for the v7 page layout (ported from the v5 demo).
// Every page wraps its markup in <div className="dm"> so the demo styles in app/demo.css apply only there.

export const ICON = {
  up: '<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 20h8"/>',
  list: '<path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  sync: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  form: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/>',
};

export function Ico({ name, badge = '' }) {
  if (badge) {
    return <span className={`ico-badge ${badge}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg class="ico" viewBox="0 0 24 24">${ICON[name]}</svg>` }} />;
  }
  return <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[name] }} />;
}

export function PageHead({ kicker, title, sub, children }) {
  return (
    <div className="head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="tools">{children}</div>}
    </div>
  );
}

export function LiveChip({ label }) {
  return (
    <span className="chip"><span className="dot" aria-hidden="true" />{label}</span>
  );
}

// KPI card. `value` may be a node (e.g. <>84.2<small>%</small></>).
export function Kpi({ label, value, sub, icon, tone = '', hot = false, spark = null }) {
  return (
    <div className={`card ${hot ? 'hot' : ''}`}>
      <div className="kl">
        <span>{label}</span>
        {icon && <Ico name={icon} badge={tone} />}
      </div>
      <div className="kv">{value}</div>
      {sub && <div className="ks">{sub}</div>}
      {spark && spark.length > 1 && <Spark data={spark} color={tone === 'r' ? '#FF5470' : '#0A7A56'} />}
    </div>
  );
}

export function Seg({ items, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.value ?? i} type="button" className={(i.value ?? i) === value ? 'on' : ''} aria-pressed={(i.value ?? i) === value} onClick={() => onChange(i.value ?? i)}>
          {i.label ?? i}
        </button>
      ))}
    </div>
  );
}

export function Ring({ pct, color, label, sub = '' }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.min(Math.max(pct, 0), 100);
  const off = c * (1 - v / 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="ring">
        <svg viewBox="0 0 120 120" width="110" height="110" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx="60" cy="60" r={r} stroke="var(--track)" strokeWidth="10" fill="none" />
          <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        </svg>
        <span style={{ color }}>{pct == null ? '—' : pct}{pct == null ? '' : <small>%</small>}</span>
      </div>
      {label && <div className="kl" style={{ justifyContent: 'center', marginTop: 8 }}>{label}</div>}
      {sub && <div className="ks" style={{ textAlign: 'center' }}>{sub}</div>}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--mut)' }}>
      {items.map(([n, c]) => (
        <span key={n}><b style={{ color: c }}>●</b> {n}</span>
      ))}
    </div>
  );
}

export function Donut({ segments, center, sub, size = 150, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + (s.value || 0), 0);
  let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {total > 0 && segments.map((seg) => {
          const len = c * (seg.value / total);
          const el = <circle key={seg.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
          off += len;
          return el;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{center}</div>
          {sub && <div className="ks">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function Bar({ pct, color }) {
  const v = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="bar"><i style={{ width: `${v}%`, background: color }} /></div>
  );
}

// Daily or weekly line chart with soft area fills. series: [{ data, color, fill }]
export function LineChart({ labels, series, max, h = 230, step }) {
  const uid = useId().replace(/:/g, '');
  const W = 760, H = h, P = 30, n = labels.length;
  const x = (k) => P + (k * (W - 2 * P)) / Math.max(1, n - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const path = (arr) => {
    let d = `M ${x(0)} ${y(arr[0])}`;
    for (let k = 1; k < arr.length; k++) {
      const x0 = x(k - 1), x1 = x(k), cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y(arr[k - 1])}, ${cx} ${y(arr[k])}, ${x1} ${y(arr[k])}`;
    }
    return d;
  };
  const st = step || Math.max(1, Math.ceil(max / 5));
  const grid = [];
  for (let v = 0; v <= max; v += st) grid.push(v);
  const every = Math.max(1, Math.ceil(n / 7));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Trend chart">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`g${uid}${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity=".30" />
            <stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {grid.map((v) => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={P - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--mut)">{v}</text>
        </g>
      ))}
      {labels.map((l, k) => ((k % every === 0 || k === n - 1)
        ? <text key={k} x={x(k)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--mut)">{l}</text>
        : null))}
      {series.map((s, i) => (s.fill
        ? <path key={`a${i}`} d={`${path(s.data)} L ${x(n - 1)} ${H - P} L ${x(0)} ${H - P} Z`} fill={`url(#g${uid}${i})`} />
        : null))}
      {series.map((s, i) => <path key={`l${i}`} d={path(s.data)} fill="none" stroke={s.color} strokeWidth="2.5" />)}
    </svg>
  );
}

// Priority word for the P-scale (Critical is P1, Urgent is P2, Regular is P3).
export const PRI_NAME = { P1: 'Critical', P2: 'Urgent', P3: 'Regular', P4: 'Regular' };
export const PRI_CLASS = { P1: 'p-crit', P2: 'p-urg', P3: 'p-reg', P4: 'p-reg' };

export function PriPill({ p }) {
  if (!p) return <span className="pillc p-reg">—</span>;
  return <span className={`pillc ${PRI_CLASS[p] || 'p-reg'}`}>{p} · {PRI_NAME[p] || ''}</span>;
}

// Live SLA state (ok, risk, br) in the demo's pill wording.
export const SLA_PILL = { ok: ['OK', 'p-ok'], risk: ['AT RISK', 'p-risk'], br: ['BREACHED', 'p-br'] };
export function SlaPill({ state }) {
  const [label, cls] = SLA_PILL[state] || SLA_PILL.ok;
  return <span className={`pillc ${cls}`}>{label}</span>;
}

export const STAT_PILL = { Open: 'p-open', Reopened: 'p-re', Resolved: 'p-res', Closed: 'p-res' };
export function StatusPill({ s }) {
  return <span className={`pillc ${STAT_PILL[s] || 'p-reg'}`}>{s || '—'}</span>;
}

export function Zc({ z }) {
  return <span className="zc">{z || '—'}</span>;
}

// Grade for the hub scorecard: share of first comments within 2h.
export function gradeFor(pct) {
  if (pct == null) return '—';
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 50) return 'C';
  return 'D';
}
export function GradePill({ pct }) {
  const g = gradeFor(pct);
  const cls = g === 'A' ? 'p-A' : g === 'B' ? 'p-B' : g === 'C' ? 'p-C' : g === 'D' ? 'p-D' : 'p-reg';
  return <span className={`pillc ${cls}`}>{g}</span>;
}

export function fmtPct(v) { return v == null ? '—' : `${v}%`; }
export function fmtH(v) { return v == null ? '—' : `${v}h`; }
export function fmtN(v) { return v == null ? '—' : Number(v).toLocaleString('en-US'); }
