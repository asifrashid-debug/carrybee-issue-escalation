'use client';
import SendReportButton from '../../components/SendReportButton';
import DateRangeFilter from '../../components/cw/DateRangeFilter';
import { useDateRange } from '../../components/cw/useDateRange';
import { rangeLabel, rangePhrase } from '../../lib/dateRange';
import Link from 'next/link';
import { useState } from 'react';
import { useAnalytics } from '../../components/useAnalytics';
import { wave, bars, hbars, donut, gauge, legend, kpiStrip } from '../../components/cw/chartlib';
import Fit from '../../components/cw/Fit';
import { fmtN, fmtH, fmtPct, PRI_COLOR, ZONE_COLOR, priHTML } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';
import { teamActions, LAG_SCORE, IMPROVE_POINTS } from '../../lib/teamGuidance';

// Raw HTML from the demo chart and card helpers. Inputs are live values; text is escaped inside the helpers.
const Html = ({ html, className }) => <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;

// Dashboard, demo layout (carrybee-complete-web.html pDash). Every number comes from the live analytics payload.
export default function Dashboard() {
  const { data, error, loading, reload } = useAnalytics();
  const { range } = useDateRange();

  if (!data) {
    return (
      <div id="dash">
        <div className="ph"><div><div className="kicker">{`Dashboard · ${rangeLabel(range)}`}</div><h1>Operations overview</h1><p className="sub">All teams and zones, scoped to your access</p></div><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><DateRangeFilter /></div></div>
        {error ? <div className="card" role="alert"><b>Could not load data.</b> {error}</div> : <div className="card">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const k = data.kpi;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const hubsByBreach = data.hubs.filter((h) => h.breaches > 0).sort((a, b) => b.breaches - a.breaches || a.hub.localeCompare(b.hub));
  const guide = teamActions(data.teams || []);
  const { actions, standing } = guide;
  // Week on week change in submitted escalations, from the live 14-day trend.
  const wkNow = data.trend.length >= 14 ? data.trend.slice(-7).reduce((a, d) => a + d.submitted, 0) : null;
  const wkPrev = data.trend.length >= 14 ? data.trend.slice(0, 7).reduce((a, d) => a + d.submitted, 0) : null;
  const wkPct = wkPrev ? Math.round(((wkNow - wkPrev) / wkPrev) * 100) : null;
  const labels = data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '));
  const flowSeries = [
    { data: data.trend.map((d) => d.submitted), color: '#08090B', fillOpacity: 0.1 },
    { data: data.trend.map((d) => d.picked), color: '#37A9FF', fillOpacity: 0.12 },
    { data: data.trend.map((d) => d.responded), color: '#0A7A56', fillOpacity: 0.18 },
  ];
  const zoneItems = data.zones.map((z) => ({ label: z.zone, value: z.open, color: ZONE_COLOR[z.zone] || '#FFCC00' }));
  const priSegs = data.priorities.map((p) => ({ label: p.label, value: p.open, color: PRI_COLOR[p.label] || '#A3A9B3' }));
  const kpis = kpiStrip([
    { label: 'Total escalations', value: fmtN(k.total), delta: wkPct != null ? `${wkPct >= 0 ? '+' : ''}${wkPct}% vs previous 7 days` : `${fmtN(k.open)} open · ${fmtN(k.closed)} closed`, good: wkPct == null || wkPct <= 0, icon: 'escalation', spark: data.trend.length >= 2 ? data.trend.map((d) => d.submitted) : undefined },
    { label: 'Open backlog', value: fmtN(k.open), sub: `${fmtN(k.unpicked)} unpicked · ${fmtN(k.awaitingResponse)} awaiting reply`, icon: 'parcel' },
    { label: 'SLA breaches', value: fmtN(k.breaches), sub: `No comment past 2h or resolution past category SLA · comment compliance ${fmtPct(k.responseSlaPct)}`, good: false, icon: 'breach', spark: data.breachTrend?.daily?.length >= 2 ? data.breachTrend.daily : undefined },
    { label: 'Median first response', value: fmtH(k.medianResponseHours), sub: `Median pick ${fmtH(k.medianPickHours)}`, icon: 'sla' },
    { label: 'Resolved', value: fmtN(k.resolved), sub: `${fmtPct(k.resolvedPct)} resolution rate`, icon: 'resolved' },
  ]);

  const desk = (
    <div className="desk">
      <Html html={kpis} />

      <div className="card mt">
        <div className="card-h">
          <div><h2>Escalation flow</h2><small>{`Submitted, picked and first response · ${rangePhrase(range)} · Asia/Dhaka`}</small></div>
          <Html html={legend([{ c: '#08090B', l: 'Submitted' }, { c: '#37A9FF', l: 'Picked' }, { c: '#0A7A56', l: 'Responded' }])} />
        </div>
        <Fit render={(w) => wave({ w, labels, every: 1, label: 'Escalation flow', bg: '#FFFFFF', h: 250, series: flowSeries })} />
      </div>

      <div className="grid g3 mt">
        <div className="card">
          <div className="card-h"><h2>Open by zone</h2><small>{fmtN(k.open)}</small></div>
          <Fit render={(w) => bars({ w, items: zoneItems, h: 200 })} />
          <div style={{ marginTop: 10 }}>
            {data.zones.map((z) => (
              <div key={z.zone} className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '4px 0' }}>
                <b><span aria-hidden="true" style={{ color: ZONE_COLOR[z.zone] || '#FFCC00' }}>● </span>{z.zone} Zone</b>
                <span>{fmtN(z.open)} open · {fmtN(z.resolved)} resolved · <span className={z.breaches ? 'bad' : ''}>{fmtN(z.breaches)} breached</span></span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>Priority mix</h2><small>open</small></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <Html html={donut({ segments: priSegs, center: fmtN(k.open), sub: 'open', size: 140, stroke: 18 })} />
            <div className="stack" style={{ gap: 10, flex: '1 1 180px', minWidth: 0 }}>
              {data.priorities.map((p) => (
                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', background: PRI_COLOR[p.label] || '#A3A9B3', flex: '0 0 auto' }} />
                  <span>{p.label}</span>
                  <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.total)}</b>
                  <span className="muted small" style={{ minWidth: 96, textAlign: 'right' }}>{pct(p.total, k.total)}% · {fmtN(p.open)} open</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>Top categories</h2><small>Highest volume drivers</small></div>
          {data.categories.length === 0 ? <div className="muted">No categories yet</div> : (
            <Html html={hbars(data.categories.map((c) => ({ label: c.label, value: c.count })), '#111216')} />
          )}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-h"><h2>Operational health</h2><small>target met</small></div>
          <div className="grid g3" style={{ gap: 8 }}>
            {[['SLA ≤ 2h', k.responseSlaPct], ['Picked ≤ 4h', k.pickSlaPct], ['Resolved', k.resolvedPct]].map(([sub, v]) => (
              <div key={sub} style={{ textAlign: 'center' }}>
                <Html html={gauge({ value: v ?? 0, color: (v ?? 0) >= 85 ? '#0A7A56' : '#FFCC00', center: v == null ? '—' : `${v}%`, sub, w: 150 })} />
              </div>
            ))}
          </div>
          <div className="grid g2" style={{ marginTop: 14, gap: 10 }}>
            <div className="card" style={{ padding: 12 }}><div className="muted small">P1 open (Critical)</div><div style={{ font: '700 26px var(--font)', color: 'var(--flare-ink)' }}>{fmtN(k.p1Open)}</div></div>
            <div className="card" style={{ padding: 12 }}><div className="muted small">P2 open (Urgent)</div><div style={{ font: '700 26px var(--font)', color: '#7A5B00' }}>{fmtN(k.p2Open)}</div></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="pill p-breach">{fmtN(k.breaches)} breached</span>
            <span className="pill p-wait">{fmtN(k.awaitingResponse)} awaiting first comment</span>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div><h2>Hub hotspots</h2><small>Most breaches (first comment or resolution)</small></div>
            <Link href="/hubs" style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint-ink)' }}>All hubs →</Link>
          </div>
          {hubsByBreach.length === 0 ? <div className="muted">No hub has a breach right now.</div> : (
            <Html html={hbars(hubsByBreach.slice(0, 5).map((h) => ({ label: h.hub, value: h.breaches })), '#FF5470')} />
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="card-h">
          <div><h2>Needs attention</h2><small>{data.attentionTotal ? `${fmtN(data.attentionTotal)} open past SLA · most urgent first` : 'Open issues past SLA'}</small></div>
        </div>
        {data.attention.length === 0 ? (
          <div className="muted"><b>All clear.</b> No open issue is past its first-comment or pick limit.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Priority</th><th>Issue</th><th>Hub · zone</th><th>Open for</th><th>SLA state</th><th>Next action</th></tr></thead>
              <tbody>
                {data.attention.map((a) => (
                  <tr key={a.issue_id}>
                    <td><Html html={priHTML(a.priority_scale)} /></td>
                    <td><Link href={`/?open=${encodeURIComponent(a.issue_id)}`} className="mono" style={{ fontWeight: 600 }}>{a.issue_id}</Link><div className="muted small">{a.issue_category || 'Uncategorised'}</div></td>
                    <td>{a.concern_hub || '—'}<div className="muted small">{a.zone || '—'}</div></td>
                    <td className="mono">{fmtH(a.ageH)}</td>
                    <td><span className="bad" style={{ fontWeight: 600 }}>{a.kind} · {fmtH(a.overdueH)} over</span></td>
                    <td>{a.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.attentionTotal > data.attention.length && (
          <p className="note">Showing {data.attention.length} of {fmtN(data.attentionTotal)}. <Link href="/" style={{ color: 'var(--mint-ink)' }}>Open the full queue in the Tracker</Link>.</p>
        )}
      </div>

      <div className="card mt">
        <div className="card-h"><div><h2>What to do next</h2><small>Owner and target on each · lagging and improving teams</small></div></div>
        <div className="grid g2" style={{ gap: 12 }}>
          <div>
            <h3 className="bad">Lagging (score below {LAG_SCORE})</h3>
            {standing.lagging.length === 0 ? <div className="muted small">No team is below {LAG_SCORE}.</div> : standing.lagging.map((r) => (
              <div key={r.team} className="step"><div><b>{r.team} · score {r.score}</b><div className="small muted">Lead: {r.lead || '—'}. {r.reasons.join(' · ') || 'Below target.'}</div></div></div>
            ))}
          </div>
          <div>
            <h3 className="good">Improving (up {IMPROVE_POINTS}+ points week over week)</h3>
            {standing.improving.length === 0 ? <div className="muted small">No team has gained {IMPROVE_POINTS}+ points yet. Each week needs at least 3 issues to compare.</div> : standing.improving.map((r) => (
              <div key={r.team} className="step"><div><b>{r.team} · {r.from} → {r.to} (+{r.delta})</b><div className="small muted">Lead: {r.lead || '—'}.</div></div></div>
            ))}
          </div>
        </div>
        {standing.rows.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <h3>Team status</h3>
            {standing.rows.map((r) => {
              const label = r.status === 'lagging' ? 'Lagging' : r.status === 'improving' ? 'Improving' : 'Steady';
              const cls = r.status === 'lagging' ? 'p-breach' : r.status === 'improving' ? 'p-ok' : 'p-res';
              return (
                <div key={r.team} className="step">
                  <span className={`pill ${cls}`}>{label}</span>
                  <div><b>{r.team} · score {r.score ?? '—'}</b>{r.delta != null && <span className="muted small"> ({r.delta >= 0 ? '+' : ''}{r.delta} week over week)</span>}<div className="small muted">Lead: {r.lead || '—'}.</div></div>
                </div>
              );
            })}
          </div>
        )}
        {actions.length === 0 ? <div className="muted" style={{ marginTop: 12 }}>Nothing needs action right now.</div> : (
          <div style={{ marginTop: 12 }}>
            {actions.map((a, i) => (
              <div key={i} className="step"><span className="pill p-reg">{i + 1}</span><div><b>{a.title}</b><div className="small muted">Owner: {a.owner}. Target: {a.target}</div><div className="small muted">How: {a.how}</div></div></div>
            ))}
          </div>
        )}
      </div>

      <div className="card mt" style={{ padding: '12px 8px 8px' }}>
        <div className="card-h" style={{ padding: '0 12px' }}><div><h2>Latest escalations</h2><small>Last 10 submitted · Dhaka time</small></div></div>
        {data.recent.length === 0 ? <div className="muted" style={{ padding: 12 }}>No escalations yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Issue ID</th><th>Submitted (Dhaka)</th><th>Zone</th><th>Hub</th><th>Category</th><th>Priority</th><th>Channel</th><th>Issue status</th><th>Ops status</th></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.issue_id}>
                    <td><Link href={`/?open=${encodeURIComponent(r.issue_id)}`} className="mono">{r.issue_id}</Link></td>
                    <td className="mono">{formatDhaka(r.submitted_at)}</td>
                    <td><span className="pill p-res">{r.zone || '—'}</span></td>
                    <td>{r.concern_hub || '—'}</td>
                    <td>{r.issue_category || '—'}</td>
                    <td><Html html={priHTML(r.priority_scale)} /></td>
                    <td>{r.channel || '—'}</td>
                    <td>{r.issue_status || '—'}</td>
                    <td>{r.ops_issue_status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="note">Breach rule: an open issue with no first comment more than 2 hours after being raised. Pick target 4h.</p>
    </div>
  );

  return (
    <div id="dash">
      <div className="ph">
        <div>
          <div className="kicker">{`Dashboard · ${rangeLabel(range)}`}</div>
          <h1>Operations overview</h1>
          <p className="sub">{`All teams and zones · ${data.meta.rows ? `${fmtN(data.meta.rows)} escalations in your scope` : 'your scope'} · ${rangePhrase(range)}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <DateRangeFilter />
          <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : 'Refresh'}</button>
          <SendReportButton />
          <span className="chip"><span className="live" aria-hidden="true" />Live · synced {formatDhaka(data.generatedAt)}</span>
        </div>
      </div>
      {error && <div className="card" role="alert" style={{ marginBottom: 12 }}>Could not refresh: {error}</div>}
      {desk}
    </div>
  );
}
