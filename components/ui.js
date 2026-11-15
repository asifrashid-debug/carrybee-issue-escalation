'use client';
import { formatDhaka } from '../lib/time';

export const PALETTE = { yellow: '#F8C800', yellowHi: '#FFE35A', charcoal: '#383838', good: '#1E9E5A', warn: '#E8A100', bad: '#D9344F' };

export const fmt = {
  num: (v) => (v == null ? '—' : Number(v).toLocaleString('en-US')),
  pct: (v) => (v == null ? '—' : `${v}%`),
  hrs: (v) => (v == null ? '—' : `${v}h`),
};

export const STATUS_COLOR = {
  New: '#383838', Picked: '#F8C800', 'In Progress': '#E8A100', 'On Hold': '#9B9B9B',
  Resolved: '#1E9E5A', Unresolved: '#D9344F', Unspecified: '#CFCBBE',
};

export function PageHead({ kicker, title, subtitle, toolbar }) {
  return (
    <section className="head-row">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {toolbar && <div className="head-tools">{toolbar}</div>}
    </section>
  );
}

export function Panel({ title, note, children, className = '', style }) {
  return (
    <section className={`glass panel ${className}`} style={style}>
      {title && <div className="ph"><h3>{title}</h3>{note && <small>{note}</small>}</div>}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone, pct, target, accent = PALETTE.yellow, hot = false }) {
  return (
    <div className={`glass kpi ${hot ? 'hot' : ''}`}>
      <div className="k-l">{label}</div>
      <div className={`k-v ${tone ? `tone-${tone}` : ''}`}>{value}</div>
      {pct != null && (
        <div className="track" role="img" aria-label={`${label} ${pct}%`}>
          <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: accent }} />
          {target != null && <b style={{ left: `${target}%` }} title={`Target ${target}%`} />}
        </div>
      )}
      {sub && <div className="k-s">{sub}</div>}
    </div>
  );
}

export function HBars({ items, max, charcoal = false, labelWidth, emptyText = 'No data yet', tone }) {
  if (!items.length) return <div className="empty">{emptyText}</div>;
  const m = max || Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      {items.map((it) => (
        <div key={it.label} className="hbar-row" style={labelWidth ? { gridTemplateColumns: `${labelWidth}px minmax(0,1fr) 64px` } : undefined}>
          <div className="hbar-label" title={it.label}>{it.label}</div>
          <div className="hbar-track">
            <div className={`hbar-fill ${charcoal ? 'charcoal' : ''} ${tone === 'bad' ? 'bad' : ''}`} style={{ width: `${Math.max(1, (it.value / m) * 100)}%` }} />
          </div>
          <div className="hbar-val">{it.display ?? fmt.num(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 200, thick = 24, center, sub }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thick) / 2 - 4;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const len = (s.value / total) * C;
    const arc = { ...s, len, off: acc };
    acc += len;
    return arc;
  });
  return (
    <div className="donut-wrap">
      <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
        <svg width={size} height={size} role="img" aria-label={`${center} ${sub || ''}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="donut-track" strokeWidth={thick} />
            {arcs.map((a) => (
              <circle key={a.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={a.color} strokeWidth={thick}
                strokeDasharray={`${a.len} ${C}`} strokeDashoffset={-a.off} />
            ))}
          </g>
        </svg>
        <div className="donut-center"><div className="dc-v">{center}</div>{sub && <div className="dc-s">{sub}</div>}</div>
      </div>
      <div className="legend">
        {segments.map((s) => (
          <div key={s.label} className="legend-row">
            <span className="legend-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{fmt.num(s.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Trend({ data, height = 230 }) {
  if (!data.length) return <div className="empty">No data yet</div>;
  const W = 760, H = height, P = { l: 36, r: 12, t: 16, b: 28 };
  const max = Math.max(4, ...data.map((d) => d.submitted));
  const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1);
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
  const path = (k) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ');
  const area = `${path('submitted')} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Daily intake, first comments and picks">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F8C800" stopOpacity=".5" />
          <stop offset="100%" stopColor="#F8C800" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="trend-grid" strokeDasharray="3 4" />
          <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="trend-txt">{t}</text>
        </g>
      ))}
      <path d={area} fill="url(#trendFill)" />
      <path d={path('submitted')} className="trend-sub" strokeLinejoin="round" />
      <path d={path('picked')} className="trend-pick" strokeLinejoin="round" />
      <path d={path('responded')} className="trend-resp" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.date}>
          <circle cx={x(i)} cy={y(d.submitted)} r="4" className="trend-dot"><title>{`${d.date}: ${d.submitted} submitted`}</title></circle>
          {(i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="trend-txt">{d.date.slice(5).split('-').reverse().join(' ')}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function TrendLegend() {
  const items = [['Submitted', '#F8C800'], ['Picked', 'var(--good)'], ['Responded', 'var(--ink)']];
  return (
    <div className="trend-legend">
      {items.map(([l, c]) => (<span key={l}><i style={{ background: c }} />{l}</span>))}
    </div>
  );
}

export function Tag({ tone = 'neutral', children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function PriorityTag({ p }) {
  return <span className={`pr pr-${p || 'NA'}`}>{p || '—'}</span>;
}

export function Toolbar({ mode, setMode, data, loading, onRefresh }) {
  return (
    <div className="toolbar">
      <div className="seg" role="group" aria-label="Data source">
        <button type="button" className={mode === 'live' ? 'on' : ''} aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Live data</button>
        <button type="button" className={mode === 'sample' ? 'on' : ''} aria-pressed={mode === 'sample'} onClick={() => setMode('sample')}>Sample preview</button>
      </div>
      <button type="button" className="btn" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      {data && <span className="updated"><span className="live-dot" aria-hidden="true" />Last synced {formatDhaka(data.generatedAt)} (Dhaka)</span>}
    </div>
  );
}

export function SampleBanner({ mode }) {
  if (mode !== 'sample') return null;
  return <div className="banner-sample" role="note">Sample preview: generated data for layout review only. Nothing here is stored or synced. Switch to Live data for real figures.</div>;
}

export function StateGate({ loading, error }) {
  if (error) {
    return (
      <div className="glass panel" style={{ maxWidth: 640, margin: '30px auto' }}>
        <div className="empty"><b>Could not load data</b>{error}</div>
      </div>
    );
  }
  return (
    <div aria-busy="true">
      <div className="g-kpi">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass kpi"><div className="skel w40" /><div className="skel tall w70" /><div className="skel w55" /></div>
        ))}
      </div>
      <div className="g-main"><div className="glass panel skel-block" /><div className="glass panel skel-block" /></div>
      <div className="sr-only" role="status">{loading ? 'Loading live data' : 'Waiting for data'}</div>
    </div>
  );
}
