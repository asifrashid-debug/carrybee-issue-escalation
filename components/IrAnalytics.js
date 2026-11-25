'use client';
import { useEffect, useState } from 'react';
import { WaveChart, Donut, DLegend, HBars } from './charts';
import { PRESETS } from '../lib/dateRange';

// Analytics block at the top of the IR Issues tab. Data: GET /api/ir/analytics (same visibility and date rules as the list).
// Counts are computed on the server over all matching issues, not just the rows shown in the table.
const C = { open: '#D98E04', resolved: '#0A7A56', picked: '#2F6FDB', progress: '#7A4FD6', bad: '#C0392B', good: '#0A7A56', mut: '#9AA0A6', ink: '#111216' };
const STATUS_COLOR = { Open: C.open, Picked: C.picked, 'In Progress': C.progress, Resolved: C.resolved };
const KAM_COLOR = { Open: C.open, 'Waiting for IR': C.progress, 'Resolved by KAM': C.resolved, 'Not set': C.mut };
const SLA_ROWS = [
  ['within', 'Within SLA', C.good], ['breached', 'Breached', C.bad], ['overdue', 'Overdue (still open)', '#E67E22'],
  ['pending', 'Pending (open, in time)', C.picked], ['skipped', 'Picked skipped', C.mut], ['none', 'No SLA set', '#CBD0D6'],
];
const RANGE_OPTIONS = [{ key: 'all', label: 'All time' }, ...PRESETS];

const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const fmtH = (v) => (v == null ? '—' : `${v} h`);

export default function IrAnalytics() {
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ir/analytics?range=${encodeURIComponent(range)}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'Could not load the analytics');
        setData(j); setErr(null);
      })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const card = { border: '1px solid var(--line, #e5e5e5)', borderRadius: 12, padding: 16, background: 'var(--card, #fff)', minWidth: 0 };
  const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 10px' };

  return (
    <section aria-label="IR analytics" style={{ padding: '12px 24px 0' }}>
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
            <div className="kpi"><div className="lab">IR issues</div><div className="num">{fmtN(data.total)}</div></div>
            <div className="kpi"><div className="lab">Open</div><div className="num">{fmtN(data.open)}</div></div>
            <div className="kpi"><div className="lab">Resolved</div><div className="num">{fmtN(data.resolved)}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Late (SLA breached or overdue)</div><div className="num" style={{ color: data.late ? C.bad : undefined }}>{fmtN(data.late)}</div></div>
          </div>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
            <div className="kpi"><div className="lab">Avg time to Picked</div><div className="num" style={{ fontSize: 26 }}>{fmtH(data.avg_pick_hours)}</div></div>
            <div className="kpi"><div className="lab">Avg time to Resolved</div><div className="num" style={{ fontSize: 26 }}>{fmtH(data.avg_resolve_hours)}</div></div>
            <div className="kpi"><div className="lab">Pick overdue (open)</div><div className="num" style={{ fontSize: 26 }}>{fmtN(data.pick.overdue)}</div></div>
            <div className="kpi" style={{ borderRight: 0 }}><div className="lab">Resolve overdue (open)</div><div className="num" style={{ fontSize: 26 }}>{fmtN(data.resolve.overdue)}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={card}>
              <div style={h3}>IR Status</div>
              <Donut segments={data.ir_status.map((s) => ({ value: s.value, color: STATUS_COLOR[s.label], label: s.label }))} center={fmtN(data.total)} sub="issues" />
              <DLegend items={data.ir_status.map((s) => ({ l: `${s.label} ${fmtN(s.value)}`, c: STATUS_COLOR[s.label] }))} />
            </div>
            <div style={card}>
              <div style={h3}>KAM Status</div>
              <Donut segments={data.kam_status.map((s) => ({ value: s.value, color: KAM_COLOR[s.label], label: s.label }))} center={fmtN(data.total)} sub="issues" />
              <DLegend items={data.kam_status.map((s) => ({ l: `${s.label} ${fmtN(s.value)}`, c: KAM_COLOR[s.label] }))} />
            </div>
            <div style={card}>
              <div style={h3}>IR Pick SLA (target {data.pick_target_hours} h from raised)</div>
              <HBars rows={SLA_ROWS.map(([k, label, color]) => ({ label, value: data.pick[k], color }))} color={C.ink} />
            </div>
            <div style={card}>
              <div style={h3}>IR Resolve SLA (category days from raised)</div>
              <HBars rows={SLA_ROWS.map(([k, label, color]) => ({ label, value: data.resolve[k], color }))} color={C.ink} />
            </div>
          </div>

          <div style={{ ...card, marginTop: 12 }}>
            <div style={h3}>Issues raised per day (Dhaka)</div>
            <WaveChart
              labels={data.trend.labels}
              every={data.trend.labels.length > 30 ? 7 : data.trend.labels.length > 14 ? 2 : 1}
              series={[{ name: 'Raised', color: C.picked, data: data.trend.values }]}
              label="IR issues raised per day"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={{ ...card, overflowX: 'auto' }}>
              <div style={h3}>By IR team member</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Member', 'Assigned', 'Open', 'Resolved', 'Late'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Member' ? 'left' : 'right', padding: '6px 8px', color: 'var(--mut)', fontWeight: 500, borderBottom: '1px solid var(--line, #eee)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.name}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--line, #f2f2f2)' }}>{m.name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line, #f2f2f2)' }}>{fmtN(m.assigned)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line, #f2f2f2)' }}>{fmtN(m.open)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line, #f2f2f2)' }}>{fmtN(m.resolved)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line, #f2f2f2)', color: m.late ? C.bad : undefined, fontWeight: m.late ? 600 : 400 }}>{fmtN(m.late)}</td>
                    </tr>
                  ))}
                  {data.members.length === 0 && <tr><td colSpan={5} style={{ padding: 8, color: 'var(--mut)' }}>No members assigned yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={h3}>Top categories</div>
              <HBars rows={data.categories.map((c) => ({ label: c.label, value: c.value, color: C.picked }))} color={C.picked} />
            </div>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Late = a pick or resolve SLA that was breached, or is still open past its target. Picked skipped = the status moved on without Picked; the pick clock is not counted as breached.
          </div>
        </div>
      )}
    </section>
  );
}
