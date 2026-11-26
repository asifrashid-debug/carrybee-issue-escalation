'use client';
import { useEffect, useState } from 'react';
import { WaveChart, Donut, DLegend, HBars } from './charts';
import { PRESETS } from '../lib/dateRange';

// Analytics block at the top of the Central Sort and TNL tabs. Same layout as the IR analytics.
// Data: GET /api/route-analytics?route=... (same visibility and date rules as the list).
// Counts are computed on the server over all matching issues, not just the rows shown in the table.
const C = { open: '#D98E04', closed: '#0A7A56', picked: '#2F6FDB', progress: '#7A4FD6', hold: '#E67E22', bad: '#C0392B', good: '#0A7A56', mut: '#9AA0A6', ink: '#111216' };
const OPS_COLOR = { New: C.open, Picked: C.picked, 'In Progress': C.progress, 'On Hold': C.hold, Resolved: C.closed, Unresolved: C.bad, 'Not set': C.mut };
const VALIDATION_PALETTE = ['#2F6FDB', '#7A4FD6', '#0A7A56', '#D98E04', '#C0392B', '#37A9FF', '#A78BFA', '#9AA0A6'];
const SLA_ROWS = [['pending', 'Open, inside target', C.picked], ['breached', 'Open, past target', C.bad], ['closed', 'Closed', C.closed]];
const RANGE_OPTIONS = [{ key: 'all', label: 'All time' }, ...PRESETS];

const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));

export default function RouteAnalytics({ route, label }) {
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/route-analytics?route=${encodeURIComponent(route)}&range=${encodeURIComponent(range)}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'Could not load the analytics');
        setData(j); setErr(null);
      })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [route, range]);

  const card = { border: '1px solid var(--line, #e5e5e5)', borderRadius: 12, padding: 16, background: 'var(--card, #fff)', minWidth: 0 };
  const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 10px' };
  const td = { padding: '6px 8px', borderBottom: '1px solid var(--line, #f2f2f2)' };
  const th = { padding: '6px 8px', color: 'var(--mut)', fontWeight: 500, borderBottom: '1px solid var(--line, #eee)' };

  return (
    <section aria-label={`${label} analytics`} style={{ padding: '12px 24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Analytics</div>
        <label style={{ fontSize: 13, color: 'var(--mut)' }}>
          Period{' '}
          <select value={range} onChange={(e) => setRange(e.target.value)} style={{ padding: '6px 8px', fontSize: 13 }}>
            {RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="err on" role="alert">{err}</div>}
      {loading && !data && <div className="hint">Loading analytics…</div>}
      {data && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="kpi"><div className="lab">{label} issues</div><div className="num">{fmtN(data.total)}</div></div>
            <div className="kpi"><div className="lab">Open</div><div className="num">{fmtN(data.open)}</div></div>
            <div className="kpi"><div className="lab">Closed (resolved in Ops)</div><div className="num">{fmtN(data.closed)}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Past resolution target</div><div className="num" style={{ color: data.late ? C.bad : undefined }}>{fmtN(data.late)}</div></div>
          </div>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
            <div className="kpi"><div className="lab">Not on the {label} sheet yet</div><div className="num" style={{ fontSize: 26, color: data.not_on_sheet ? C.hold : undefined }}>{fmtN(data.not_on_sheet)}</div></div>
            <div className="kpi"><div className="lab">Ops Status set</div><div className="num" style={{ fontSize: 26 }}>{fmtN(data.total - (data.ops_status.find((s) => s.label === 'Not set')?.value || 0))}</div></div>
            <div className="kpi"><div className="lab">Validation set</div><div className="num" style={{ fontSize: 26 }}>{fmtN(data.total - (data.validation.find((s) => s.label === 'Not set')?.value || 0))}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Zones</div><div className="num" style={{ fontSize: 26 }}>{fmtN(data.zones.filter((z) => z.label !== 'Not set').length)}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={card}>
              <div style={h3}>Ops Status</div>
              <Donut segments={data.ops_status.filter((s) => s.value > 0).map((s) => ({ value: s.value, color: OPS_COLOR[s.label] || C.mut, label: s.label }))} center={fmtN(data.total)} sub="issues" />
              <DLegend items={data.ops_status.map((s) => ({ l: `${s.label} ${fmtN(s.value)}`, c: OPS_COLOR[s.label] || C.mut }))} />
            </div>
            <div style={card}>
              <div style={h3}>Validation</div>
              <Donut segments={data.validation.filter((s) => s.value > 0).map((s, i) => ({ value: s.value, color: s.label === 'Not set' ? C.mut : VALIDATION_PALETTE[i % VALIDATION_PALETTE.length], label: s.label }))} center={fmtN(data.total)} sub="issues" />
              <DLegend items={data.validation.map((s, i) => ({ l: `${s.label} ${fmtN(s.value)}`, c: s.label === 'Not set' ? C.mut : VALIDATION_PALETTE[i % VALIDATION_PALETTE.length] }))} />
            </div>
            <div style={card}>
              <div style={h3}>Resolution target (category days from raised)</div>
              <HBars rows={SLA_ROWS.map(([k, text, color]) => ({ label: text, value: data.sla[k], color }))} color={C.ink} />
            </div>
          </div>

          <div style={{ ...card, marginTop: 12 }}>
            <div style={h3}>Issues raised per day (Dhaka)</div>
            <WaveChart
              labels={data.trend.labels}
              every={data.trend.labels.length > 30 ? 7 : data.trend.labels.length > 14 ? 2 : 1}
              series={[{ name: 'Raised', color: C.picked, data: data.trend.values }]}
              label={`${label} issues raised per day`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={{ ...card, overflowX: 'auto' }}>
              <div style={h3}>By zone</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Zone', 'Issues', 'Open', 'Past target'].map((h) => <th key={h} style={{ ...th, textAlign: h === 'Zone' ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.zones.map((z) => (
                    <tr key={z.label}>
                      <td style={td}>{z.label}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtN(z.total)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtN(z.open)}</td>
                      <td style={{ ...td, textAlign: 'right', color: z.late ? C.bad : undefined, fontWeight: z.late ? 600 : 400 }}>{fmtN(z.late)}</td>
                    </tr>
                  ))}
                  {data.zones.length === 0 && <tr><td colSpan={4} style={{ padding: 8, color: 'var(--mut)' }}>No issues in this period.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ ...card, overflowX: 'auto' }}>
              <div style={h3}>Top HUBs</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['HUB', 'Issues', 'Open', 'Past target'].map((h) => <th key={h} style={{ ...th, textAlign: h === 'HUB' ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.hubs.map((h) => (
                    <tr key={h.label}>
                      <td style={td}>{h.label}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtN(h.total)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtN(h.open)}</td>
                      <td style={{ ...td, textAlign: 'right', color: h.late ? C.bad : undefined, fontWeight: h.late ? 600 : 400 }}>{fmtN(h.late)}</td>
                    </tr>
                  ))}
                  {data.hubs.length === 0 && <tr><td colSpan={4} style={{ padding: 8, color: 'var(--mut)' }}>No issues in this period.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={h3}>Top categories</div>
              <HBars rows={data.categories.map((c) => ({ label: c.label, value: c.value, color: C.picked }))} color={C.picked} />
            </div>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Past resolution target = open and older than the category resolution days. Ops Status and Validation fill in as the Ops {label} tracker syncs back.
          </div>
        </div>
      )}
    </section>
  );
}
