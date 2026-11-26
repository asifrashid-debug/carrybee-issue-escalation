'use client';
import DateRangeFilter from './cw/DateRangeFilter';
import Fit from './cw/Fit';
import { wave, hbars, donut, gauge, legend, kpiStrip } from './cw/chartlib';
import { fmtN, fmtH, fmtPct } from './cw/format';
import { useRangeAnalytics } from './cw/useRangeAnalytics';
import { rangeLabel, rangePhrase } from '../lib/dateRange';
import { formatDhaka } from '../lib/time';

// IR analytics, same layout as the Analytics page (KPI strip, daily trend, SLA bars, donuts, gauges, tables).
// Data: GET /api/ir/analytics (same visibility and date rules as the list). Counts cover all matching issues.
const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const STATUS_COLOR = { Open: '#A3A1A8', Picked: '#FFCC00', 'In Progress': '#FFB020', Resolved: '#00E5A0' };
const KAM_COLOR = { Open: '#A3A1A8', 'Waiting for IR': '#37A9FF', 'Resolved by KAM': '#00E5A0', 'Not set': '#CFCBBE' };
const SLA_ROWS = [
  ['within', 'Within target', '#00E5A0'],
  ['breached', 'Breached', '#FF5470'],
  ['overdue', 'Overdue (still open)', '#FF8A3D'],
  ['pending', 'Pending (open, in time)', '#37A9FF'],
  ['skipped', 'Picked skipped', '#A3A1A8'],
  ['none', 'No target set', '#CFCBBE'],
];
const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : null);
const gaugeColor = (p) => (p != null && p >= 85 ? '#0A7A56' : '#FFCC00');
const slaItems = (bucket) => SLA_ROWS.filter(([k]) => k === 'within' || k === 'breached' || k === 'overdue' || k === 'pending' || bucket[k] > 0)
  .map(([k, label, color]) => ({ label, value: bucket[k] || 0, color }));

export default function IrAnalytics() {
  const { data, error, loading, range, reload } = useRangeAnalytics('/api/ir/analytics');

  const toolbar = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <div>
        <div className="kicker">{`IR analytics · ${rangeLabel(range)}`}</div>
        <h2 style={{ margin: 0 }}>IR issues</h2>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <DateRangeFilter />
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh IR analytics">{loading ? 'Refreshing…' : 'Refresh'}</button>
        {data && <span className="chip"><span className="live" aria-hidden="true" />Live · synced {formatDhaka(data.generated_at)}</span>}
      </div>
    </div>
  );

  if (!data) {
    return (
      <section aria-label="IR analytics" style={{ padding: '12px 24px 0' }}>
        {toolbar}
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </section>
    );
  }

  const statusVal = (label) => data.ir_status.find((s) => s.label === label)?.value || 0;
  const pickDecided = data.pick.within + data.pick.breached + data.pick.overdue;
  const resDecided = data.resolve.within + data.resolve.breached + data.resolve.overdue;
  const pickPct = pctOf(data.pick.within, pickDecided);
  const resPct = pctOf(data.resolve.within, resDecided);
  const resolvedPct = pctOf(data.resolved, data.total);
  const labels = data.trend.labels.map((l) => l.split('-').reverse().join(' '));
  const every = labels.length > 30 ? 7 : labels.length > 14 ? 2 : 1;

  return (
    <section aria-label="IR analytics" style={{ padding: '12px 24px 0' }}>
      {toolbar}
      {error && <div className="card" role="alert" style={{ marginBottom: 12 }}>Could not refresh: {error}</div>}
      <div style={{ opacity: loading ? 0.6 : 1 }}>
        <Html html={kpiStrip([
          { label: 'IR issues', value: fmtN(data.total), sub: `${fmtN(data.open)} open · ${fmtN(data.resolved)} resolved`, icon: 'ir' },
          { label: 'Open backlog', value: fmtN(data.open), sub: `${fmtN(statusVal('Open'))} not picked · ${fmtN(statusVal('Picked'))} picked`, icon: 'escalation' },
          { label: 'Late (SLA breached or overdue)', value: fmtN(data.late), sub: 'Pick or resolve target missed', icon: 'breach', good: false },
          { label: 'Avg time to resolve', value: fmtH(data.avg_resolve_hours), sub: `Avg time to pick ${fmtH(data.avg_pick_hours)}`, icon: 'sla' },
        ])} />

        <div className="card mt">
          <div className="card-h">
            <div><h2>Issues raised per day</h2><small>{`IR issues, ${rangePhrase(range)} (Dhaka)`}</small></div>
            <Html html={legend([{ c: '#2F6FDB', l: 'Raised' }])} />
          </div>
          <Fit render={(w) => wave({ w, labels, every, label: 'IR issues raised per day', bg: '#FFFFFF', h: 240, series: [
            { data: data.trend.values, color: '#2F6FDB', fillOpacity: 0.14 },
          ] })} />
        </div>

        <div className="grid g2 mt">
          <div className="card">
            <div className="card-h"><div><h2>IR pick SLA</h2><small>{`Target ${data.pick_target_hours} h from raised`}</small></div></div>
            <Html html={hbars(slaItems(data.pick), '#111216')} />
          </div>
          <div className="card">
            <div className="card-h"><div><h2>IR resolve SLA</h2><small>Category days from raised</small></div></div>
            <Html html={hbars(slaItems(data.resolve), '#111216')} />
          </div>
        </div>

        <div className="grid g3 mt">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Picked within target</h2><small>{`Target ${data.pick_target_hours} h · picked or late issues`}</small></div></div>
            <Html html={gauge({ value: pickPct ?? 0, color: gaugeColor(pickPct), center: pickPct == null ? '—' : `${pickPct}%`, sub: `Avg ${fmtH(data.avg_pick_hours)}`, w: 200 })} />
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Resolved within target</h2><small>Category days</small></div></div>
            <Html html={gauge({ value: resPct ?? 0, color: gaugeColor(resPct), center: resPct == null ? '—' : `${resPct}%`, sub: `Avg ${fmtH(data.avg_resolve_hours)}`, w: 200 })} />
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Resolved</h2><small>{`${fmtN(data.resolved)} of ${fmtN(data.total)} issues`}</small></div></div>
            <Html html={gauge({ value: resolvedPct ?? 0, color: '#0A7A56', center: resolvedPct == null ? '—' : `${resolvedPct}%`, sub: 'Resolved so far', w: 200 })} />
          </div>
        </div>

        <div className="grid g2 mt">
          <StatusDonut title="IR status" subtitle={`${fmtN(data.total)} issues`} rows={data.ir_status} colors={STATUS_COLOR} total={data.total} />
          <StatusDonut title="KAM status" subtitle="Set by the KAM, their team lead or an admin" rows={data.kam_status} colors={KAM_COLOR} total={data.total} />
        </div>

        <div className="grid g2 mt">
          <div className="card" style={{ padding: '12px 8px 8px' }}>
            <div className="card-h" style={{ padding: '0 12px' }}><div><h2>Categories</h2><small>Share of IR issues</small></div></div>
            {data.categories.length === 0 ? <div className="empty">No categories yet</div> : (
              <table>
                <thead><tr><th>Category</th><th>Count</th><th>Share</th></tr></thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.label}><td>{c.label}</td><td className="mono">{fmtN(c.value)}</td><td className="mono">{fmtPct(pctOf(c.value, data.total) ?? 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card" style={{ padding: '12px 8px 8px' }}>
            <div className="card-h" style={{ padding: '0 12px' }}><div><h2>By IR team member</h2><small>Assigned, open, resolved and late</small></div></div>
            {data.members.length === 0 ? <div className="empty">No members assigned yet</div> : (
              <table>
                <thead><tr><th>Member</th><th>Assigned</th><th>Open</th><th>Resolved</th><th>Late</th></tr></thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.name}>
                      <td>{m.name}</td>
                      <td className="mono">{fmtN(m.assigned)}</td>
                      <td className="mono">{fmtN(m.open)}</td>
                      <td className="mono">{fmtN(m.resolved)}</td>
                      <td className="mono" style={{ color: m.late ? '#FF5470' : undefined, fontWeight: m.late ? 700 : 400 }}>{fmtN(m.late)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className="note">
          Late = a pick or resolve target that was missed, or is still open past its target. Picked skipped = the status moved on without Picked; the pick clock is not counted as missed.
        </p>
      </div>
    </section>
  );
}

// Donut with a colour legend that lists every status, the same layout as the Feedback outcomes card.
function StatusDonut({ title, subtitle, rows, colors, total }) {
  const segs = rows.filter((s) => s.value > 0).map((s) => ({ label: s.label, value: s.value, color: colors[s.label] || '#A3A1A8' }));
  return (
    <div className="card">
      <div className="card-h"><div><h2>{title}</h2><small>{subtitle}</small></div></div>
      {total === 0 ? <div className="empty">No IR issues in this period</div> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <Html html={donut({ segments: segs, center: fmtN(total), sub: 'issues', size: 160, stroke: 20 })} />
          <div className="stack" style={{ gap: 12, flex: '1 1 180px', minWidth: 0 }}>
            {rows.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <i style={{ width: 9, height: 9, borderRadius: '50%', background: colors[s.label] || '#A3A1A8', flex: '0 0 auto' }} />
                <span>{s.label}</span>
                <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtN(s.value)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

