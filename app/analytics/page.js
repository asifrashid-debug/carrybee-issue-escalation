'use client';
import { useAnalytics } from '../../components/useAnalytics';
import { PageHead, Kpi, Seg, LiveChip, Bar, fmtN, fmtPct, fmtH } from '../../components/demo';
import { WaveChart, BarChart, HBars, Donut as DonutChart, Gauge, DLegend } from '../../components/charts';
import { formatDhaka } from '../../lib/time';

const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };
const STATUS_COLOR = { New: '#A3A1A8', Picked: '#FFCC00', 'In Progress': '#FFB020', 'On Hold': '#9B9B9B', Resolved: '#00E5A0', Unresolved: '#FF5470', Unspecified: '#CFCBBE' };

// Analytics & Insights (demo layout). Same numbers as before, scoped to the viewer's access.
export default function Analytics() {
  const { data, error, loading, reload } = useAnalytics();

  if (!data) {
    return (
      <div className="dm">
        <PageHead kicker="Analytics · 14 days" title="Escalation analytics" sub="Trend, distribution, SLA funnel and operational patterns" />
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const k = data.kpi;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const busiest = data.zones.reduce((best, z) => (z.total > best.total ? z : best), data.zones[0]);
  const stages = [
    { label: 'Submitted', value: k.total, color: '#08090B' },
    { label: 'Picked by ops', value: k.picked, color: '#37A9FF' },
    { label: 'First response', value: k.responded, color: '#A78BFA' },
    { label: 'Resolved', value: k.resolved, color: '#00E5A0' },
    { label: 'Closed', value: k.closed, color: '#00E5A0' },
  ];

  return (
    <div className="dm dchart">
      <PageHead kicker="Analytics · 14 days" title="Escalation analytics" sub={`Trend, distribution, SLA funnel and operational patterns · last 14 days · ${busiest ? `busiest zone ${busiest.zone}` : ''}`}>
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
        <LiveChip label={`Live · synced ${formatDhaka(data.generatedAt)}`} />
      </PageHead>

      {error && <div className="box box-bad" role="alert">Could not refresh: {error}</div>}

      <div className="grid g4 kpi-strip">
        <Kpi label="SLA compliance" value={<>{fmtPct(k.responseSlaPct).replace('%', '')}<small>%</small></>} sub="First comment within 2h · target 90%" icon="check" tone="g" />
        <Kpi label="Open backlog" value={fmtN(k.open)} sub={`${fmtN(k.unpicked)} unpicked · ${fmtN(k.awaitingResponse)} awaiting reply`} icon="shield" tone="b" />
        <Kpi label="SLA breached" value={fmtN(k.breaches)} sub="No comment past 2h or resolution past category SLA" icon="alert" tone="r" hot={k.breaches > 0} />
        <Kpi label="Older than 2 days" value={fmtN(k.olderThan2d)} sub="Open, needs escalation review" icon="clock" />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <div><h2>Daily volume</h2><small>Submitted and first responses, last 14 days (Dhaka)</small></div>
          <DLegend items={[{ c: '#08090B', l: 'Submitted' }, { c: '#0A7A56', l: 'Responded' }]} />
        </div>
        <WaveChart
          label="Daily volume"
          labels={data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '))}
          every={1}
          h={240}
          series={[
            { data: data.trend.map((d) => d.submitted), color: '#08090B', fillOpacity: 0.1 },
            { data: data.trend.map((d) => d.responded), color: '#0A7A56', fillOpacity: 0.18 },
          ]}
        />
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h"><div><h2>Ageing of open cases</h2><small>Whole days since submission · open issues</small></div></div>
          {k.open === 0 ? <div className="empty">No open cases</div> : (
            <BarChart
              label="Ageing of open cases"
              h={210}
              w={420}
              items={data.ageing.map((a, i) => ({ label: a.label, value: a.count, color: ['#00E5A0', '#FFCC00', '#FF5470'][i] || '#A3A1A8' }))}
            />
          )}
        </div>

        <div className="card">
          <div className="card-h"><div><h2>Feedback outcomes</h2><small>Share of closed cases · {fmtN(data.feedbackOutcomes.closed)} closed</small></div></div>
          {data.feedbackOutcomes.closed === 0 ? <div className="empty">No closed cases yet</div> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
              <DonutChart
                segments={data.feedbackOutcomes.items.map((f, i) => ({ label: f.label, value: f.count, color: ['#00E5A0', '#37A9FF', '#FF5470', '#A3A1A8'][i] }))}
                center={fmtPct(data.feedbackOutcomes.items[0]?.pct ?? 0)}
                sub="resolved"
                size={160}
                stroke={20}
              />
              <div className="lst" style={{ flex: '1 1 180px', minWidth: 0 }}>
                {data.feedbackOutcomes.items.map((f, i) => (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <i style={{ width: 9, height: 9, borderRadius: '50%', background: ['#00E5A0', '#37A9FF', '#FF5470', '#A3A1A8'][i], flex: '0 0 auto' }} />
                    <span>{f.label}</span>
                    <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(f.pct)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h"><div><h2>Funnel</h2><small>Submission → pick → first response → resolution → closure</small></div></div>
          <HBars rows={stages.map((st) => ({ label: st.label, value: st.value, color: st.color }))} />
          <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 11.5, color: 'var(--mut)' }}>
            {stages.slice(1).map((st, i) => (
              <div key={st.label}>{st.label}: {pct(st.value, stages[i].value)}% carry-through from {stages[i].label.toLowerCase()}</div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><h2>Categories</h2><small>Share of all issues</small></div></div>
          {data.categories.length === 0 ? <div className="empty">No categories yet</div> : (
            <HBars rows={data.categories.map((c) => ({ label: c.label, value: c.count }))} color="#111216" />
          )}
        </div>
      </div>

        <div className="card">
          <div className="ph"><div><h3>Zone SLA Performance</h3><small>Compliance, first comment and resolution</small></div></div>
          <div className="lst">
            {data.zones.map((z) => (
              <div key={z.zone} className="lrow" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: ZONE_COLOR[z.zone] }}>● {z.zone}</b>
                  <b className={z.responseSlaPct == null ? '' : z.responseSlaPct >= 90 ? 'good' : z.responseSlaPct >= 75 ? 'warn' : 'bad'}>{fmtPct(z.responseSlaPct)} SLA</b>
                </div>
                <Bar pct={z.responseSlaPct ?? 0} color={ZONE_COLOR[z.zone]} />
                <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--mut)', marginTop: 6, flexWrap: 'wrap' }}>
                  <span>Total <b style={{ color: 'var(--ink)' }}>{fmtN(z.total)}</b></span>
                  <span>Open <b style={{ color: 'var(--ink)' }}>{fmtN(z.open)}</b></span>
                  <span>1st comment <b style={{ color: 'var(--ink)' }}>{fmtH(z.medianResponseHours)}</b></span>
                  <span>Resolved <b style={{ color: 'var(--ink)' }}>{fmtPct(pct(z.resolved, z.total) || 0)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>

      <div className="grid g2">
        <div className="card">
          <div className="ph"><div><h3>Ops Status Mix</h3><small>Share of all issues</small></div></div>
          <HBars rows={data.statuses.slice(0, 6).map((st) => ({ label: st.label, value: st.count, color: STATUS_COLOR[st.label] || STATUS_COLOR.Unspecified }))} />
        </div>
        <div className="card">
          <div className="ph"><div><h3>Channel Split</h3><small>KAM vs MX · MX issues go to the CM team</small></div></div>
          <HBars rows={data.channels.map((c) => ({ label: c.label === 'Unspecified' ? 'Unspecified channel' : `${c.label} channel`, value: c.count, color: '#37A9FF' }))} />
        </div>
      </div>

      <div className="grid g3">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="ph" style={{ width: '100%' }}><div><h3>First Comment ≤ 2h</h3><small>Target 90%</small></div></div>
          <Gauge value={k.responseSlaPct ?? 0} color={(k.responseSlaPct ?? 0) >= 85 ? '#0A7A56' : '#FFCC00'} center={k.responseSlaPct == null ? '—' : `${k.responseSlaPct}%`} sub={`Median ${fmtH(k.medianResponseHours)}`} w={200} />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="ph" style={{ width: '100%' }}><div><h3>Picked ≤ 4h</h3><small>Target 90%</small></div></div>
          <Gauge value={k.pickSlaPct ?? 0} color={(k.pickSlaPct ?? 0) >= 85 ? '#0A7A56' : '#37A9FF'} center={k.pickSlaPct == null ? '—' : `${k.pickSlaPct}%`} sub={`Median ${fmtH(k.medianPickHours)}`} w={200} />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="ph" style={{ width: '100%' }}><div><h3>Resolved</h3><small>{fmtN(k.resolved)} of {fmtN(k.total)} issues</small></div></div>
          <Gauge value={k.resolvedPct ?? 0} color="#0A7A56" center={k.resolvedPct == null ? '—' : `${k.resolvedPct}%`} sub="Resolved so far" w={200} />
        </div>
      </div>

      <div className="card">
        <div className="ph"><div><h3>Attention counts</h3><small>Open issues</small></div></div>
        <div className="grid g4" style={{ margin: 0 }}>
          {[['Breached (comment or resolution)', k.breaches], ['Awaiting first comment', k.awaitingResponse], ['Unpicked', k.unpicked], ['P1 open', k.p1Open]].map(([l, v]) => (
            <div key={l} className="lrow" style={{ justifyContent: 'space-between' }}><b>{l}</b><span>{fmtN(v)}</span></div>
          ))}
        </div>
        <div className="note">Breach rule: an open issue with no first comment more than 2 hours after being raised. Median first comment: {fmtH(k.medianResponseHours)}.</div>
      </div>
    </div>
  );
}
