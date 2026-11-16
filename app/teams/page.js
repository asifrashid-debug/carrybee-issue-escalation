'use client';
import { useAnalytics } from '../../components/useAnalytics';
import { PageHead, Kpi, Seg, LiveChip, Bar, fmtN, fmtPct, fmtH } from '../../components/demo';
import { HBars } from '../../components/charts';
import { formatDhaka } from '../../lib/time';

const PALETTE = ['#F8C800', '#3B9CFF', '#A78BFA', '#3DDC97', '#FF9F1C', '#FF5D73', '#7DD3FC'];

// Team Performance (demo layout). Team scope follows the same rules as the tracker.
export default function TeamPerformance() {
  const { data, error, loading, reload } = useAnalytics();

  if (!data) {
    return (
      <div className="dm dchart">
        <PageHead kicker="Team performance · 14 days" title="Team performance" sub="Team and member scorecards" />
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
  // Demo order: issues raised and breaches by team (real data).
  const teamsByIssues = [...teams].sort((a, b) => b.issues - a.issues || a.team.localeCompare(b.team));
  const maxTeamIssues = Math.max(1, ...teams.map((t) => t.issues));
  const maxTeamBreaches = Math.max(1, ...teams.map((t) => t.breaches || 0));
  const weeks = data.weeks || [];

  const teamCard = (t, i) => {
    const c = colorOf(i);
    const sla = t.responseSlaPct;
    return (
      <div key={t.team} className="card">
        <div className="ph" style={{ marginBottom: 6 }}>
          <div>
            <b style={{ fontSize: 15 }}><span style={{ color: c }}>●</span> {t.team}</b>
            <div className="ks">{fmtN(t.members)} member{t.members === 1 ? '' : 's'} · lead {t.lead || '—'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: c }}>{sla == null ? '—' : sla}</div>
            <div className="kl" style={{ fontSize: 9.5 }}>Comment ≤ 2h</div>
          </div>
        </div>
        <div className="bar" style={{ margin: '10px 0 12px', height: 6 }}><i style={{ width: `${sla ?? 0}%`, background: c }} /></div>
        <div className="grid tstat4" style={{ gap: 6, margin: 0 }}>
          {[['Total', t.issues], ['Open', t.open], ['Resolved', t.resolved], ['P1 open', t.p1Open]].map(([l, v]) => (
            <div key={l} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 7, fontSize: 10, color: 'var(--mut)', fontWeight: 700, letterSpacing: '.06em' }}>
              {l.toUpperCase()}<div style={{ fontSize: 17, color: 'var(--ink)', letterSpacing: 0 }}>{fmtN(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: 'var(--mut)' }}><span>Resolution</span><b style={{ color: c }}>{fmtPct(t.resolvedPct)}</b></div>
        <Bar pct={t.resolvedPct ?? 0} color={c} />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <span className={`pillc ${sla == null ? 'p-reg' : sla >= 90 ? 'p-ok' : 'p-risk'}`}>{sla == null ? 'No data' : `Comment ≤ 2h ${sla}%`}</span>
          <span className="pillc" style={{ background: 'rgba(59,156,255,.14)', color: 'var(--blue)' }}>Median comment {fmtH(t.medianResponseHours)}</span>
          <span className="pillc" style={{ background: 'rgba(167,139,250,.16)', color: 'var(--purple)' }}>{fmtN(t.issuesPerMember ?? 0)} per member</span>
        </div>
      </div>
    );
  };

  const heat = (v) => ({ background: v ? `rgba(248,200,0,${Math.min(0.15 + v * 0.12, 0.85)})` : 'var(--tagBg)', color: v ? 'var(--ink)' : 'var(--mut)' });

  return (
    <div className="dm">
      <PageHead kicker="Team performance · 14 days" title="Team performance" sub="Team and member scorecards · issues raised by each team's members · same scope as the tracker">
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
        <LiveChip label={`Live · synced ${formatDhaka(data.generatedAt)}`} />
      </PageHead>

      {error && <div className="box box-bad" role="alert">Could not refresh: {error}</div>}

      <div className="grid g4 kpi-strip">
        <Kpi label="Active teams" value={fmtN(teams.length)} sub={`${fmtN(members)} members in teams`} icon="users" />
        <Kpi label="Total escalations" value={fmtN(k.total)} sub={`${fmtN(k.open)} still open`} icon="shield" tone="b" />
        <Kpi label="Top team" value={<>{top ? fmtN(top.issues) : '—'} <small>{top?.team || ''}</small></>} sub="Most escalations raised" icon="trophy" tone="g" />
        <Kpi label="Issues per member" value={avgPerMember ?? '—'} sub="Average across teams" icon="trophy" tone="p" />
      </div>

      {teams.length > 0 && (
        <div className="grid g2">
          <div className="card">
            <div className="ph"><div><h3>Issues Raised by Team</h3><small>All escalations raised by each team's members</small></div></div>
            <HBars rows={teamsByIssues.map((t) => ({ label: t.team, value: t.issues, color: '#FFCC00' }))} />
          </div>
          <div className="card">
            <div className="ph"><div><h3>Breaches by Team</h3><small>Lower is better</small></div></div>
            <HBars rows={teamsByIssues.map((t) => ({ label: t.team, value: t.breaches || 0, color: '#FF5470' }))} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="ph"><div><h3>Member performance</h3><small>Individual results for each team · issues raised by each member</small></div></div>
        {teams.length === 0 ? <div className="empty">No teams yet.</div> : teams.map((t, i) => (
          <div key={t.team} style={{ marginTop: i ? 18 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <b><span style={{ color: colorOf(i) }}>●</span> {t.team}</b>
              <span className="ks">lead {t.lead || '—'} · {fmtN(t.members)} member{t.members === 1 ? '' : 's'}</span>
            </div>
            {(t.people || []).length === 0 ? <div className="empty">No members in this team.</div> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Member</th><th>Role</th><th style={{ textAlign: 'right' }}>Issues</th><th style={{ textAlign: 'right' }}>Open</th><th style={{ textAlign: 'right' }}>Resolved</th><th style={{ textAlign: 'right' }}>Comment ≤ 2h</th><th style={{ textAlign: 'right' }}>Breaches</th><th style={{ textAlign: 'right' }}>P1 open</th><th style={{ textAlign: 'right' }}>Unpicked</th></tr></thead>
                  <tbody>
                    {t.people.map((p) => (
                      <tr key={p.email}>
                        <td><b>{p.name}</b><div className="ks">{p.email}</div></td>
                        <td>{String(p.role || '').replace(/_/g, ' ')}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.issues)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.open)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtN(p.resolved)} <span style={{ color: 'var(--mut)' }}>({fmtPct(p.resolvedPct)})</span></td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtPct(p.responseSlaPct)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: p.breaches ? 'var(--bad)' : undefined }}>{fmtN(p.breaches)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: p.p1Open ? 'var(--bad)' : undefined }}>{fmtN(p.p1Open)}</td>
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

      {teams.length === 0 ? (
        <div className="card"><div className="empty"><b>No teams yet</b>Team membership comes from users_roles.</div></div>
      ) : (
        <>
          <div className="grid g3">{teams.slice(0, 3).map((t, i) => teamCard(t, i))}</div>
          {teams.length > 3 && <div className="grid tcards">{teams.slice(3).map((t, i) => teamCard(t, i + 3))}</div>}
        </>
      )}

      <div className="card">
        <div className="ph"><div><h3>Weekly Submission Matrix</h3><small>Team × ISO week volume (Dhaka time)</small></div></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Team</th>{weeks.map((w) => <th key={w} style={{ textAlign: 'center' }}>{w}</th>)}</tr></thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.team}>
                  <td><b>{t.team}</b></td>
                  {(t.weekly || weeks.map(() => 0)).map((v, i) => (
                    <td key={i}><div className="heat" style={heat(v)}>{v || '—'}</div></td>
                  ))}
                </tr>
              ))}
              {teams.length === 0 && <tr><td colSpan={weeks.length + 1}><div className="empty">No teams yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
        {data.unmappedRaisers > 0 && <div className="note">{fmtN(data.unmappedRaisers)} issues were raised by people not mapped to a team.</div>}
      </div>
    </div>
  );
}
