'use client';
import { useAnalytics } from '../../components/useAnalytics';
import { PageHead, Kpi, Seg, LiveChip, Legend, Bar, LineChart, Ring, fmtN, fmtPct, fmtH } from '../../components/demo';
import { formatDhaka } from '../../lib/time';

const ZONE_COLOR = { ISD: '#F8C800', OSD: '#3B9CFF', CTG: '#A78BFA' };
const STATUS_COLOR = { New: '#A3A1A8', Picked: '#F8C800', 'In Progress': '#FFB020', 'On Hold': '#9B9B9B', Resolved: '#3DDC97', Unresolved: '#FF5D73', Unspecified: '#CFCBBE' };

// Analytics & Insights (demo layout). Same numbers as before, scoped to the viewer's access.
export default function Analytics() {
  const { data, error, loading, mode, setMode, reload } = useAnalytics();

  if (!data) {
    return (
      <div className="dm">
        <PageHead title="Analytics & Insights" sub="Trend, distribution, SLA funnel and operational patterns" />
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const k = data.kpi;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const busiest = data.zones.reduce((best, z) => (z.total > best.total ? z : best), data.zones[0]);
  const stages = [
    { label: 'Submitted', value: k.total, color: '#F8C800' },
    { label: 'Picked by ops', value: k.picked, color: '#3B9CFF' },
    { label: 'First response', value: k.responded, color: '#A78BFA' },
    { label: 'Resolved', value: k.resolved, color: '#3DDC97' },
    { label: 'Closed', value: k.closed, color: '#3DDC97' },
  ];
  const maxTrend = Math.max(4, ...data.trend.flatMap((d) => [d.submitted, d.responded]));

  return (
    <div className="dm">
      <PageHead title="Analytics & Insights" sub={`Trend, distribution, SLA funnel and operational patterns · last 14 days · ${busiest ? `busiest zone ${busiest.zone}` : ''}`}>
        <Seg label="Data source" items={[{ value: 'live', label: 'Live data' }, { value: 'sample', label: 'Sample preview' }]} value={mode} onChange={setMode} />
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
        <LiveChip label={`Live · synced ${formatDhaka(data.generatedAt)}`} />
      </PageHead>

      {mode === 'sample' && <div className="box box-warn" role="note">Sample preview: generated data for layout review only. Nothing here is stored or synced.</div>}
      {error && <div className="box box-bad" role="alert">Could not refresh: {error}</div>}

      <div className="grid g4">
        <Kpi label="SLA compliance" value={<>{fmtPct(k.responseSlaPct).replace('%', '')}<small>%</small></>} sub="First comment within 2h · target 90%" icon="check" tone="g" />
        <Kpi label="Open backlog" value={fmtN(k.open)} sub={`${fmtN(k.unpicked)} unpicked · ${fmtN(k.awaitingResponse)} awaiting reply`} icon="shield" tone="b" />
        <Kpi label="SLA breached" value={fmtN(k.breaches)} sub="No comment past 2h or resolution past category SLA" icon="alert" tone="r" hot={k.breaches > 0} />
        <Kpi label="Older than 2 days" value={fmtN(k.olderThan2d)} sub="Open, needs escalation review" icon="clock" />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ph">
          <div><h3>Intake vs First Response</h3><small>Daily submissions and first comments · last 14 days (Dhaka)</small></div>
          <Legend items={[['Submitted', '#F8C800'], ['Responded', '#3DDC97']]} />
        </div>
        <LineChart
          labels={data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '))}
          series={[
            { data: data.trend.map((d) => d.submitted), color: '#F8C800', fill: 1 },
            { data: data.trend.map((d) => d.responded), color: '#3DDC97', fill: 1 },
          ]}
          max={maxTrend}
          step={Math.max(1, Math.ceil(maxTrend / 4))}
          h={240}
        />
      </div>

      <div className="grid g2e">
        <div className="card">
          <div className="ph"><div><h3>Lifecycle Funnel</h3><small>Submission → pick → first response → resolution → closure</small></div></div>
          <div className="lst">
            {stages.map((s, i) => {
              const prev = i === 0 ? null : stages[i - 1].value;
              return (
                <div key={s.label}>
                  <div style={{ margin: '0 auto', width: `${Math.max(pct(s.value, k.total), 35)}%`, border: `1px solid ${s.color}`, background: `${s.color}22`, borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{s.label}</span><span style={{ color: s.color }}>{fmtN(s.value)}</span>
                  </div>
                  {prev != null && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mut)', margin: '4px 0 6px' }}>{pct(s.value, prev)}% carry-through</div>}
                </div>
              );
            })}
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
      </div>

      <div className="grid g3">
        <div className="card">
          <div className="ph"><div><h3>Ops Status Mix</h3><small>Share of all issues</small></div></div>
          <div className="lst">
            {data.statuses.slice(0, 6).map((s) => (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><b style={{ color: STATUS_COLOR[s.label] }}>{s.label}</b><span>{fmtN(s.count)} · {pct(s.count, k.total)}%</span></div>
                <Bar pct={pct(s.count, k.total)} color={STATUS_COLOR[s.label] || STATUS_COLOR.Unspecified} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="ph"><div><h3>Top Issue Categories</h3><small>Share of all issues</small></div></div>
          {data.categories.length === 0 ? <div className="empty">No categories yet</div> : (
            <div className="lst">
              {data.categories.map((c) => (
                <div key={c.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{c.label}</span><b>{fmtN(c.count)}</b></div>
                  <Bar pct={pct(c.count, k.total)} color="#F8C800" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ph"><div><h3>Channel Split</h3><small>KAM vs MX · MX issues go to the CM team</small></div></div>
          <div className="lst">
            {data.channels.map((c) => (
              <div key={c.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{c.label === 'Unspecified' ? 'Unspecified channel' : `${c.label} channel`}</span><b>{fmtN(c.count)}</b></div>
                <Bar pct={pct(c.count, k.total)} color="#3B9CFF" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="ph" style={{ width: '100%' }}><div><h3>First Comment ≤ 2h</h3><small>Target 90%</small></div></div>
          <Ring pct={k.responseSlaPct} color="#F8C800" label={`Median ${fmtH(k.medianResponseHours)}`} />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="ph" style={{ width: '100%' }}><div><h3>Picked ≤ 4h</h3><small>Target 90%</small></div></div>
          <Ring pct={k.pickSlaPct} color="#3B9CFF" label={`Median ${fmtH(k.medianPickHours)}`} />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="ph" style={{ width: '100%' }}><div><h3>Resolved</h3><small>{fmtN(k.resolved)} of {fmtN(k.total)} issues</small></div></div>
          <Ring pct={k.resolvedPct} color="#3DDC97" label="Resolved so far" />
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
