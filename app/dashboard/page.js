'use client';
import Link from 'next/link';
import { useAnalytics } from '../../components/useAnalytics';
import { PageHead, Kpi, Seg, LiveChip, Ring, Legend, Bar, Donut, LineChart, PriPill, Zc, fmtN, fmtPct, fmtH } from '../../components/demo';
import { formatDhaka } from '../../lib/time';
import { teamActions, LAG_SCORE, IMPROVE_POINTS } from '../../lib/teamGuidance';

const ZONE_COLOR = { ISD: '#F8C800', OSD: '#3B9CFF', CTG: '#A78BFA' };
const PRI_COLOR = { P1: '#FF5D73', P2: '#FFB020', P3: '#A3A1A8', P4: '#6B6B73' };

// Operations Command Centre (demo layout). Exception-first: SLA breaches, owners and next actions.
export default function Dashboard() {
  const { data, error, loading, mode, setMode, reload } = useAnalytics();

  if (!data) {
    return (
      <div className="dm">
        <PageHead kicker="Command centre" title="Operations Command Centre" sub="All teams and zones, scoped to your access" />
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const k = data.kpi;
  const hubsByBreach = data.hubs.filter((h) => h.breaches > 0).sort((a, b) => b.breaches - a.breaches || a.hub.localeCompare(b.hub));
  // Team guidance: actions per team with named owners, plus who is lagging and who is improving.
  const guide = teamActions(data.teams || []);
  const actions = guide.actions;
  const standing = guide.standing;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const maxFlow = Math.max(4, ...data.trend.flatMap((d) => [d.submitted, d.picked, d.responded]));
  // Week on week change in submitted escalations, from the live 14-day trend (needs both halves)
  const wkNow = data.trend.length >= 14 ? data.trend.slice(-7).reduce((a, d) => a + d.submitted, 0) : null;
  const wkPrev = data.trend.length >= 14 ? data.trend.slice(0, 7).reduce((a, d) => a + d.submitted, 0) : null;
  const wkPct = wkPrev ? Math.round(((wkNow - wkPrev) / wkPrev) * 100) : null;
  const maxCat = Math.max(1, ...data.categories.map((c) => c.count));

  return (
    <div className="dm">
      <PageHead kicker="Command centre" title="Operations Command Centre" sub={`All teams and zones · ${data.meta.rows ? `${fmtN(data.meta.rows)} escalations in your scope` : 'your scope'} · last 14 days`}>
        <Seg label="Data source" items={[{ value: 'live', label: 'Live data' }, { value: 'sample', label: 'Sample preview' }]} value={mode} onChange={setMode} />
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
        <LiveChip label={`Live · synced ${formatDhaka(data.generatedAt)}`} />
      </PageHead>

      {mode === 'sample' && <div className="box box-warn" role="note">Sample preview: generated data for layout review only. Nothing here is stored or synced.</div>}
      {error && <div className="box box-bad" role="alert">Could not refresh: {error}</div>}

      <div className="grid g5 kpi-strip">
        <Kpi label="Total escalations" value={fmtN(k.total)} sub={`${fmtN(k.open)} open · ${fmtN(k.closed)} closed${wkPct != null ? ` · submitted ${wkPct >= 0 ? '+' : ''}${wkPct}% vs previous 7 days` : ''}`} icon="shield" />
        <Kpi label="Open backlog" value={fmtN(k.open)} sub={`${fmtN(k.unpicked)} unpicked · ${fmtN(k.awaitingResponse)} awaiting reply`} icon="clock" tone="b" />
        <Kpi label="SLA breaches" value={fmtN(k.breaches)} sub={<><span className="bad">No comment past 2h or resolution past category SLA</span> · comment compliance {fmtPct(k.responseSlaPct)}</>} icon="alert" tone="r" hot={k.breaches > 0} />
        <Kpi label="Median first response" value={<>{fmtH(k.medianResponseHours)}</>} sub={`Median pick ${fmtH(k.medianPickHours)}`} icon="clock" tone="g" />
        <Kpi label="Resolved" value={fmtN(k.resolved)} sub={`${fmtPct(k.resolvedPct)} resolution rate`} icon="check" tone="g" />
      </div>

      <div className="card only-desk">
          <div className="ph">
            <div><h3>Escalation Flow</h3><small>Daily intake, pick and first comment · last 14 days (Dhaka)</small></div>
            <Legend items={[['Submitted', '#F8C800'], ['Picked', '#3B9CFF'], ['Responded', '#3DDC97']]} />
          </div>
          <LineChart
            labels={data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '))}
            series={[
              { data: data.trend.map((d) => d.submitted), color: '#F8C800', fill: 1 },
              { data: data.trend.map((d) => d.picked), color: '#3B9CFF', fill: 1 },
              { data: data.trend.map((d) => d.responded), color: '#3DDC97', fill: 1 },
            ]}
            max={maxFlow}
            h={250}
          />
        </div>

      <div className="grid g3 only-desk">
        <div className="card only-desk">
          <div className="ph"><div><h3>Open by Zone</h3><small>Share of open backlog · resolved and breached per zone</small></div></div>
          <div className="lst">
            {data.zones.map((z) => {
              const color = ZONE_COLOR[z.zone] || '#F8C800';
              return (
                <div key={z.zone}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ color }}>● {z.zone} Zone</b>
                    <span>{fmtN(z.open)} open · {fmtN(z.resolved)} resolved · <span className={z.breaches ? 'bad' : ''}>{fmtN(z.breaches)} breached</span></span>
                  </div>
                  <Bar pct={pct(z.open, k.open)} color={color} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="ph"><div><h3>Priority Mix</h3><small>All escalations in scope</small></div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <Donut
              segments={data.priorities.map((p) => ({ label: p.label, value: p.total, color: PRI_COLOR[p.label] }))}
              center={fmtN(k.total)}
              sub="escalations"
            />
            <div className="lst" style={{ flex: '1 1 180px', minWidth: 0 }}>
              {data.priorities.map((p) => (
                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', background: PRI_COLOR[p.label], flex: '0 0 auto' }} />
                  <span>{p.label}</span>
                  <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.total)}</b>
                  <span style={{ color: 'var(--mut)', minWidth: 96, textAlign: 'right' }}>{pct(p.total, k.total)}% · {fmtN(p.open)} open</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ph"><div><h3>Top Issue Categories</h3><small>Highest volume drivers</small></div></div>
          {data.categories.length === 0 ? <div className="empty">No categories yet</div> : (
            <div className="lst">
              {data.categories.map((c) => (
                <div key={c.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{c.label}</span><b>{fmtN(c.count)}</b></div>
                  <Bar pct={(c.count / maxCat) * 100} color="#F8C800" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="ph"><div><h3>Operational Health</h3><small>Rolling compliance</small></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            <Ring pct={k.responseSlaPct} color="#F8C800" label="SLA" sub="Comment ≤ 2h" />
            <Ring pct={k.pickSlaPct} color="#3B9CFF" label="Picked" sub="Pick ≤ 4h" />
            <Ring pct={k.resolvedPct} color="#3DDC97" label="Resolved" />
          </div>
          <div className="grid g2e" style={{ marginTop: 14, gap: 10 }}>
            <div className="card hot" style={{ padding: 12 }}><div className="kl">P1 open</div><div className="kv" style={{ fontSize: 26, color: 'var(--bad)' }}>{fmtN(k.p1Open)}</div></div>
            <div className="card" style={{ padding: 12 }}><div className="kl">P2 open</div><div className="kv" style={{ fontSize: 26, color: 'var(--warn)' }}>{fmtN(k.p2Open)}</div></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="pillc p-br">{fmtN(k.breaches)} breached</span>
            <span className="pillc p-open">{fmtN(k.awaitingResponse)} awaiting first comment</span>
          </div>
        </div>
        <div className="card only-desk">
          <div className="ph">
            <div><h3>Hub Hotspots</h3><small>Most breaches (first comment or resolution)</small></div>
            <Link href="/hubs" style={{ fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--y)' }}>All hubs →</Link>
          </div>
          {hubsByBreach.length === 0 ? <div className="empty">No hub has a breach right now.</div> : (
            <div className="lst">
              {hubsByBreach.slice(0, 5).map((h) => (
                <div key={h.hub} className="lrow">
                  <div><div className="n">{h.hub}</div><div className="s">{h.zone || '—'} · median comment {fmtH(h.medianResponseHours)}</div></div>
                  <div className="r"><b className="bad">{fmtN(h.breaches)}</b><div className="s">breached</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
          <div className="ph">
            <div><h3>Needs attention</h3><small>{data.attentionTotal ? `${fmtN(data.attentionTotal)} open past SLA · most urgent first` : 'Open issues past SLA'}</small></div>
          </div>
          {data.attention.length === 0 ? (
            <div className="empty"><b>All clear</b>No open issue is past its first-comment or pick limit.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Priority</th><th>Issue</th><th>Hub · zone</th><th>Open for</th><th>SLA state</th><th>Next action</th></tr></thead>
                <tbody>
                  {data.attention.map((a) => (
                    <tr key={a.issue_id}>
                      <td><PriPill p={a.priority_scale} /></td>
                      <td><Link href={`/?open=${encodeURIComponent(a.issue_id)}`} style={{ fontWeight: 700, color: 'var(--blue)' }}>{a.issue_id}</Link><div className="sub">{a.issue_category || 'Uncategorised'}</div></td>
                      <td>{a.concern_hub || '—'}<div className="sub">{a.zone || '—'}</div></td>
                      <td>{fmtH(a.ageH)}</td>
                      <td><span className="sla-bad">{a.kind} · {fmtH(a.overdueH)} over</span></td>
                      <td className="wrap">{a.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.attentionTotal > data.attention.length && (
            <div className="note">Showing {data.attention.length} of {fmtN(data.attentionTotal)}. <Link href="/" style={{ color: 'var(--y)' }}>Open the full queue in the Tracker</Link>.</div>
          )}
        </div>

        <div className="card">
          <div className="ph"><div><h3>What to do next</h3><small>Owner and target on each · lagging and improving teams</small></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bad)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>Lagging (score below {LAG_SCORE})</div>
              {standing.lagging.length === 0 ? <div className="s">No team is below {LAG_SCORE}.</div> : standing.lagging.map((r) => (
                <div key={r.team} className="lrow" style={{ alignItems: 'flex-start' }}>
                  <div><div className="n">{r.team} · score {r.score}</div><div className="s">Lead: {r.lead || '—'}. {r.reasons.join(' · ') || 'Below target.'}{r.smallSample ? ` Small sample: ${r.issues} issue${r.issues === 1 ? '' : 's'}.` : ''}</div></div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--good)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>Improving (up {IMPROVE_POINTS}+ points week over week)</div>
              {standing.improving.length === 0 ? <div className="s">No team has gained {IMPROVE_POINTS}+ points yet. Each week needs at least 3 issues to compare.</div> : standing.improving.map((r) => (
                <div key={r.team} className="lrow" style={{ alignItems: 'flex-start' }}>
                  <div><div className="n">{r.team} · {r.from} → {r.to} (+{r.delta})</div><div className="s">Lead: {r.lead || '—'}. {r.score != null && r.score < LAG_SCORE ? `Still below ${LAG_SCORE}, so keep going.` : 'Keep the routine that is working.'}</div></div>
                </div>
              ))}
            </div>
          </div>
          {standing.rows.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--mute)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>Team status</div>
              <div className="lst">
                {standing.rows.map((r) => {
                  const label = r.status === 'lagging' ? 'Lagging' : r.status === 'improving' ? 'Improving' : 'Steady';
                  const color = r.status === 'lagging' ? 'var(--bad)' : r.status === 'improving' ? 'var(--good)' : 'var(--mute)';
                  return (
                    <div key={r.team} className="lrow" style={{ alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color, border: `1px solid ${color}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{label}</span>
                      <div><div className="n">{r.team} · score {r.score ?? '—'}{r.delta != null ? ` (${r.delta >= 0 ? '+' : ''}${r.delta} week over week)` : ''}</div><div className="s">Lead: {r.lead || '—'}. {r.status === 'steady' ? (r.reasons.length ? `Watch: ${r.reasons.join(' · ')}.` : 'On target.') : (r.reasons.join(' · ') || 'Below target.')}{r.smallSample ? ` Small sample: ${r.issues} issue${r.issues === 1 ? '' : 's'}.` : ''}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {actions.length === 0 ? <div className="empty">Nothing needs action right now.</div> : (
            <div className="lst">
              {actions.map((a, i) => (
                <div key={i} className="lrow" style={{ alignItems: 'flex-start' }}>
                  <span className="pillc p-B">{i + 1}</span>
                  <div><div className="n">{a.title}</div><div className="s">Owner: {a.owner}. Target: {a.target}</div><div className="s">How: {a.how}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>

      <div className="card only-desk">
        <div className="ph"><div><h3>Latest escalations</h3><small>Last 10 submitted · Dhaka time</small></div></div>
        {data.recent.length === 0 ? <div className="empty">No escalations yet.</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Issue ID</th><th>Submitted (Dhaka)</th><th>Zone</th><th>Hub</th><th>Category</th><th>Priority</th><th>Channel</th><th>Issue status</th><th>Ops status</th></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.issue_id}>
                    <td><Link href={`/?open=${encodeURIComponent(r.issue_id)}`} className="idc" style={{ textDecoration: 'none' }}>{r.issue_id}</Link></td>
                    <td className="mono">{formatDhaka(r.submitted_at)}</td>
                    <td><Zc z={r.zone} /></td>
                    <td>{r.concern_hub || '—'}</td>
                    <td>{r.issue_category || '—'}</td>
                    <td><PriPill p={r.priority_scale} /></td>
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
      <p className="note2">Breach rule: an open issue with no first comment more than 2 hours after being raised. Pick target 4h.</p>
    </div>
  );
}
