'use client';
import { useAnalytics } from '../../components/useAnalytics';
import { wave, hbars, kpiStrip, legend } from '../../components/cw/chartlib';
import Fit from '../../components/cw/Fit';
import { fmtN, fmtH, fmtPct } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';

const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const PALETTE = ['#FFCC00', '#37A9FF', '#A78BFA', '#00E5A0', '#FF9F1C', '#FF5470', '#7DD3FC'];

// Team Performance, demo layout (carrybee-complete-web.html pTeams). Team scope follows the same rules as the tracker.
export default function TeamPerformance() {
  const { data, error, loading, reload } = useAnalytics();

  if (!data) {
    return (
      <div>
        <div className="ph"><div><div className="kicker">Team performance · 14 days</div><h1>Team performance</h1><p className="sub">Team and member scorecards</p></div></div>
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const teams = data.teams;
  const colorOf = (i) => PALETTE[i % PALETTE.length];
  const members = teams.reduce((a, t) => a + t.members, 0);
  const top = teams.reduce((best, t) => (!best || t.issues > best.issues ? t : best), null);
  const perMember = teams.filter((t) => t.issuesPerMember != null);
  const avgPerMember = perMember.length ? Math.round((perMember.reduce((a, t) => a + t.issuesPerMember, 0) / perMember.length) * 10) / 10 : null;
  const k = data.kpi;
  const teamsByIssues = [...teams].sort((a, b) => b.issues - a.issues || a.team.localeCompare(b.team));
  const weeks = data.weeks || [];
  const labels = data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '));

  const heat = (v) => ({ background: v ? `rgba(255,204,0,${Math.min(0.15 + v * 0.12, 0.85)})` : '#F1F0EB', color: v ? '#08090B' : '#6B6F78', borderRadius: 8, padding: '6px 0', textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums' });

  return (
    <div>
      <div className="ph">
        <div>
          <div className="kicker">Team performance · 14 days</div>
          <h1>Team performance</h1>
          <p className="sub">Team and member scorecards · issues raised by each team&apos;s members · same scope as the tracker</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : 'Refresh'}</button>
          <span className="chip"><span className="live" aria-hidden="true" />Live · synced {formatDhaka(data.generatedAt)}</span>
        </div>
      </div>

      {error && <div className="card" role="alert" style={{ marginBottom: 12 }}>Could not refresh: {error}</div>}

      <Html html={kpiStrip([
        { label: 'Active teams', value: fmtN(teams.length), sub: `${fmtN(members)} members in teams`, icon: 'team' },
        { label: 'Total escalations', value: fmtN(k.total), sub: `${fmtN(k.open)} still open`, icon: 'escalation', spark: data.trend.length >= 2 ? data.trend.map((d) => d.submitted) : undefined },
        { label: 'Top team', value: top ? `${fmtN(top.issues)} · ${top.team}` : '—', sub: 'Most escalations raised', icon: 'resolved' },
        { label: 'Issues per member', value: avgPerMember ?? '—', sub: 'Average across teams', icon: 'team' },
      ])} />

      <div className="card mt">
        <div className="card-h">
          <div><h2>Responses per day</h2><small>Submitted and first responses, last 14 days (Dhaka)</small></div>
          <Html html={legend([{ c: '#08090B', l: 'Submitted' }, { c: '#0A7A56', l: 'First response' }])} />
        </div>
        <Fit render={(w) => wave({ w, labels, every: 1, label: 'Responses per day', bg: '#FFFFFF', series: [
          { data: data.trend.map((d) => d.responded), color: '#0A7A56', fillOpacity: 0.14 },
          { data: data.trend.map((d) => d.submitted), color: '#08090B', fillOpacity: 0 },
        ] })} />
      </div>

      {teams.length > 0 && (
        <div className="grid g2 mt">
          <div className="card">
            <div className="card-h"><div><h2>Issues raised by team</h2><small>All escalations raised by each team&apos;s members</small></div></div>
            <Html html={hbars(teamsByIssues.map((t) => ({ label: t.team, value: t.issues })), '#111216')} />
          </div>
          <div className="card">
            <div className="card-h"><div><h2>Breaches by team</h2><small>Lower is better</small></div></div>
            <Html html={hbars(teamsByIssues.map((t) => ({ label: t.team, value: t.breaches || 0, color: '#FF5470' })), '#FF5470')} />
          </div>
        </div>
      )}

      {teams.length > 0 && (
        <div className="grid g3 mt">
          {teams.map((t, i) => {
            const c = colorOf(i);
            const sla = t.responseSlaPct;
            return (
              <div key={t.team} className="card">
                <div className="card-h" style={{ marginBottom: 6 }}>
                  <div>
                    <b style={{ fontSize: 15 }}><span style={{ color: c }}>●</span> {t.team}</b>
                    <div className="muted small">{fmtN(t.members)} member{t.members === 1 ? '' : 's'} · lead {t.lead || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: c }}>{sla == null ? '—' : `${sla}%`}</div>
                    <div className="muted small">Comment ≤ 2h</div>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', margin: '10px 0 12px' }}><i style={{ display: 'block', height: '100%', width: `${sla ?? 0}%`, background: c }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                  {[['Total', t.issues], ['Open', t.open], ['Resolved', t.resolved], ['P1 open', t.p1Open]].map(([l, v]) => (
                    <div key={l} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 7, fontSize: 10, color: 'var(--mut)', fontWeight: 700, letterSpacing: '.06em' }}>
                      {l.toUpperCase()}<div style={{ fontSize: 17, color: 'var(--text)', letterSpacing: 0 }}>{fmtN(v)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: 'var(--mut)' }}><span>Resolution</span><b style={{ color: c }}>{fmtPct(t.resolvedPct)}</b></div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', marginTop: 6 }}><i style={{ display: 'block', height: '100%', width: `${t.resolvedPct ?? 0}%`, background: c }} /></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <span className={`pill ${sla == null ? 'p-res' : sla >= 90 ? 'p-ok' : 'p-wait'}`}>{sla == null ? 'No data' : `Comment ≤ 2h ${sla}%`}</span>
                  <span className="pill p-wait">Median comment {fmtH(t.medianResponseHours)}</span>
                  <span className="pill p-res">{fmtN(t.issuesPerMember ?? 0)} per member</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card mt">
        <div className="card-h"><div><h2>Member performance</h2><small>Individual results for each team · issues raised by each member</small></div></div>
        {teams.length === 0 ? <div className="empty">No teams yet.</div> : teams.map((t, i) => (
          <div key={t.team} style={{ marginTop: i ? 18 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <b><span style={{ color: colorOf(i) }}>●</span> {t.team}</b>
              <span className="muted small">lead {t.lead || '—'} · {fmtN(t.members)} member{t.members === 1 ? '' : 's'}</span>
            </div>
            {(t.people || []).length === 0 ? <div className="empty">No members in this team.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Member</th><th>Role</th><th style={{ textAlign: 'right' }}>Issues</th><th style={{ textAlign: 'right' }}>Open</th><th style={{ textAlign: 'right' }}>Resolved</th><th style={{ textAlign: 'right' }}>Comment ≤ 2h</th><th style={{ textAlign: 'right' }}>Breaches</th><th style={{ textAlign: 'right' }}>P1 open</th><th style={{ textAlign: 'right' }}>Unpicked</th></tr></thead>
                  <tbody>
                    {t.people.map((p) => (
                      <tr key={p.email}>
                        <td><b>{p.name}</b><div className="muted small">{p.email}</div></td>
                        <td>{String(p.role || '').replace(/_/g, ' ')}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.issues)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.open)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.resolved)} <span className="muted">({fmtPct(p.resolvedPct)})</span></td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtPct(p.responseSlaPct)}</td>
                        <td className={`mono ${p.breaches ? 'bad' : ''}`} style={{ textAlign: 'right' }}>{fmtN(p.breaches)}</td>
                        <td className={`mono ${p.p1Open ? 'bad' : ''}`} style={{ textAlign: 'right' }}>{fmtN(p.p1Open)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.unpicked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="card-h"><div><h2>Weekly submission matrix</h2><small>Team × ISO week volume (Dhaka time)</small></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Team</th>{weeks.map((w) => <th key={w} style={{ textAlign: 'center' }}>{w}</th>)}</tr></thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.team}>
                  <td><b>{t.team}</b></td>
                  {(t.weekly || weeks.map(() => 0)).map((v, i) => (
                    <td key={i}><div style={heat(v)}>{v || '—'}</div></td>
                  ))}
                </tr>
              ))}
              {teams.length === 0 && <tr><td colSpan={weeks.length + 1}><div className="empty">No teams yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
        {data.unmappedRaisers > 0 && <p className="note">{fmtN(data.unmappedRaisers)} issues were raised by people not mapped to a team.</p>}
      </div>
    </div>
  );
}
