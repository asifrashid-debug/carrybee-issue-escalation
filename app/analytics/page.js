'use client';
import { useAnalytics } from '../../components/useAnalytics';
import { wave, bars, hbars, donut, gauge, legend, kpiStrip } from '../../components/cw/chartlib';
import Fit from '../../components/cw/Fit';
import { fmtN, fmtH, fmtPct } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';

const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };
const STATUS_COLOR = { New: '#A3A1A8', Picked: '#FFCC00', 'In Progress': '#FFB020', 'On Hold': '#9B9B9B', Resolved: '#00E5A0', Unresolved: '#FF5470', Unspecified: '#CFCBBE' };
const FB_COLOR = ['#00E5A0', '#37A9FF', '#FF5470', '#A3A1A8'];

// Analytics, demo layout (carrybee-complete-web.html pAnalytics). Every number is live and scoped to the viewer's access.
export default function Analytics() {
  const { data, error, loading, reload } = useAnalytics();

  if (!data) {
    return (
      <div>
        <div className="ph"><div><div className="kicker">Analytics · 14 days</div><h1>Escalation analytics</h1><p className="sub">Trend, distribution, SLA funnel and operational patterns</p></div></div>
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const k = data.kpi;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const busiest = data.zones.reduce((best, z) => (z.total > best.total ? z : best), data.zones[0]);
  const labels = data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '));
  const stages = [
    { label: 'Submitted', value: k.total, color: '#08090B' },
    { label: 'Picked by ops', value: k.picked, color: '#37A9FF' },
    { label: 'First response', value: k.responded, color: '#A78BFA' },
    { label: 'Resolved', value: k.funnelResolved, color: '#00E5A0' },
    { label: 'Closed (KAM feedback)', value: k.closed, color: '#00E5A0' },
  ];
  const fbSegs = data.feedbackOutcomes.items.map((f, i) => ({ label: f.label, value: f.count, color: FB_COLOR[i] }));

  return (
    <div>
      <div className="ph">
        <div>
          <div className="kicker">Analytics · 14 days</div>
          <h1>Escalation analytics</h1>
          <p className="sub">{`Trend, distribution, SLA funnel and operational patterns · last 14 days${busiest ? ` · busiest zone ${busiest.zone}` : ''}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : 'Refresh'}</button>
          <span className="chip"><span className="live" aria-hidden="true" />Live · synced {formatDhaka(data.generatedAt)}</span>
        </div>
      </div>

      {error && <div className="card" role="alert" style={{ marginBottom: 12 }}>Could not refresh: {error}</div>}

      <Html html={kpiStrip([
        { label: 'SLA compliance', value: fmtPct(k.responseSlaPct), sub: 'First comment within 2h · target 90%', icon: 'sla' },
        { label: 'Open backlog', value: fmtN(k.open), sub: `${fmtN(k.unpicked)} unpicked · ${fmtN(k.awaitingResponse)} awaiting reply`, icon: 'escalation' },
        { label: 'SLA breached', value: fmtN(k.breaches), sub: 'No comment past 2h or resolution past category SLA', icon: 'breach', good: false, spark: data.breachTrend?.daily?.length >= 2 ? data.breachTrend.daily : undefined },
        { label: 'Older than 2 days', value: fmtN(k.olderThan2d), sub: 'Open, needs escalation review', icon: 'followup' },
      ])} />

      <div className="card mt">
        <div className="card-h">
          <div><h2>Daily volume</h2><small>Submitted and first responses, last 14 days (Dhaka)</small></div>
          <Html html={legend([{ c: '#08090B', l: 'Submitted' }, { c: '#0A7A56', l: 'Responded' }])} />
        </div>
        <Fit render={(w) => wave({ w, labels, every: 1, label: 'Daily volume', bg: '#FFFFFF', h: 240, series: [
          { data: data.trend.map((d) => d.submitted), color: '#08090B', fillOpacity: 0.1 },
          { data: data.trend.map((d) => d.responded), color: '#0A7A56', fillOpacity: 0.18 },
        ] })} />
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-h"><div><h2>Ageing of open cases</h2><small>Whole days since submission · open issues</small></div></div>
          {k.open === 0 ? <div className="empty">No open cases</div> : (
            <Fit render={(w) => bars({ w, h: 210, items: data.ageing.map((a, i) => ({ label: a.label, value: a.count, color: ['#00E5A0', '#FFCC00', '#FF5470'][i] || '#A3A1A8' })) })} />
          )}
        </div>
        <div className="card">
          <div className="card-h"><div><h2>Feedback outcomes</h2><small>Share of closed cases · {fmtN(data.feedbackOutcomes.closed)} closed</small></div></div>
          {data.feedbackOutcomes.closed === 0 ? <div className="empty">No closed cases yet</div> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
              <Html html={donut({ segments: fbSegs, center: fmtPct(data.feedbackOutcomes.items[0]?.pct ?? 0), sub: 'resolved', size: 160, stroke: 20 })} />
              <div className="stack" style={{ gap: 12, flex: '1 1 180px', minWidth: 0 }}>
                {data.feedbackOutcomes.items.map((f, i) => (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <i style={{ width: 9, height: 9, borderRadius: '50%', background: FB_COLOR[i], flex: '0 0 auto' }} />
                    <span>{f.label}</span>
                    <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(f.pct)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-h"><div><h2>Funnel</h2><small>Submission → pick → first response → resolution → closure</small></div></div>
          <Html html={hbars(stages.map((st) => ({ label: st.label, value: st.value, color: st.color })), '#111216')} />
          <div className="small muted" style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {stages.slice(1).map((st, i) => (
              <div key={st.label}>{st.label}: {pct(st.value, stages[i].value)}% carry-through from {stages[i].label.toLowerCase()}</div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 8px 8px' }}>
          <div className="card-h" style={{ padding: '0 12px' }}><div><h2>Categories</h2><small>Share of all issues</small></div></div>
          {data.categories.length === 0 ? <div className="empty">No categories yet</div> : (
            <table>
              <thead><tr><th>Category</th><th>Count</th><th>Share</th></tr></thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.label}><td>{c.label}</td><td className="mono">{fmtN(c.count)}</td><td className="mono">{pct(c.count, k.total)}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="card-h"><div><h2>Zone SLA performance</h2><small>Compliance, first comment and resolution</small></div></div>
        {data.zones.map((z) => (
          <div key={z.zone} style={{ padding: '10px 0', borderBottom: '1px solid var(--line2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b><span aria-hidden="true" style={{ color: ZONE_COLOR[z.zone] }}>● </span>{z.zone}</b>
              <b className={z.responseSlaPct == null ? '' : z.responseSlaPct >= 90 ? 'good' : z.responseSlaPct >= 75 ? '' : 'bad'}>{fmtPct(z.responseSlaPct)} SLA</b>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', margin: '8px 0' }}>
              <i style={{ display: 'block', height: '100%', width: `${z.responseSlaPct ?? 0}%`, background: ZONE_COLOR[z.zone] }} />
            </div>
            <div className="small muted" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>Total <b style={{ color: 'var(--text)' }}>{fmtN(z.total)}</b></span>
              <span>Open <b style={{ color: 'var(--text)' }}>{fmtN(z.open)}</b></span>
              <span>1st comment <b style={{ color: 'var(--text)' }}>{fmtH(z.medianResponseHours)}</b></span>
              <span>Resolved <b style={{ color: 'var(--text)' }}>{fmtPct(pct(z.resolved, z.total) || 0)}</b></span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-h"><div><h2>Ops status mix</h2><small>Share of all issues</small></div></div>
          <Html html={hbars(data.statuses.slice(0, 6).map((st) => ({ label: st.label, value: st.count, color: STATUS_COLOR[st.label] || STATUS_COLOR.Unspecified })), '#111216')} />
        </div>
        <div className="card">
          <div className="card-h"><div><h2>Channel split</h2><small>KAM vs MX · MX issues go to the CM team</small></div></div>
          <Html html={hbars(data.channels.map((c) => ({ label: c.label === 'Unspecified' ? 'Unspecified channel' : `${c.label} channel`, value: c.count, color: '#37A9FF' })), '#111216')} />
        </div>
      </div>

      <div className="grid g3 mt">
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>First comment ≤ 2h</h2><small>Target 90%</small></div></div>
          <Html html={gauge({ value: k.responseSlaPct ?? 0, color: (k.responseSlaPct ?? 0) >= 85 ? '#0A7A56' : '#FFCC00', center: k.responseSlaPct == null ? '—' : `${k.responseSlaPct}%`, sub: `Median ${fmtH(k.medianResponseHours)}`, w: 200 })} />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Picked ≤ 4h</h2><small>Target 90%</small></div></div>
          <Html html={gauge({ value: k.pickSlaPct ?? 0, color: (k.pickSlaPct ?? 0) >= 85 ? '#0A7A56' : '#37A9FF', center: k.pickSlaPct == null ? '—' : `${k.pickSlaPct}%`, sub: `Median ${fmtH(k.medianPickHours)}`, w: 200 })} />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Resolved</h2><small>{fmtN(k.resolved)} of {fmtN(k.total)} issues</small></div></div>
          <Html html={gauge({ value: k.resolvedPct ?? 0, color: '#0A7A56', center: k.resolvedPct == null ? '—' : `${k.resolvedPct}%`, sub: 'Resolved so far', w: 200 })} />
        </div>
      </div>

      <div className="card mt">
        <div className="card-h"><div><h2>Attention counts</h2><small>Open issues</small></div></div>
        <div className="grid g4">
          {[['Breached (comment or resolution)', k.breaches], ['Awaiting first comment', k.awaitingResponse], ['Unpicked', k.unpicked], ['P1 open (Critical)', k.p1Open]].map(([l, v]) => (
            <div key={l} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span className="small">{l}</span><b>{fmtN(v)}</b></div>
          ))}
        </div>
        <p className="note">Breach rule: an open issue with no first comment more than 2 hours after being raised. Median first comment: {fmtH(k.medianResponseHours)}.</p>
      </div>
    </div>
  );
}
