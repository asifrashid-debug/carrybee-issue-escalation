'use client';
import { useMemo, useState } from 'react';
import { useAnalytics } from '../../components/useAnalytics';
import { bars, hbars, gauge, gradePill, sbar, kpiStrip } from '../../components/cw/chartlib';
import { fmtN, fmtH, fmtPct } from '../../components/cw/format';
import { formatDhaka } from '../../lib/time';

const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const ZONE_COLOR = { ISD: '#FFCC00', OSD: '#37A9FF', CTG: '#A78BFA' };
const ZONES = ['ISD', 'OSD', 'CTG'];
// Hub grade from first-comment share: A 90% or more, B 75%, C 50%, D below.
const gradeOf = (pct) => (pct == null ? null : pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 50 ? 'C' : 'D');

// HUB Performance, demo layout (carrybee-complete-web.html pHubs). Live hub numbers only.
export default function HubPerformance() {
  const { data, error, loading, reload } = useAnalytics();
  const [zone, setZone] = useState('All Zones');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'breaches', desc: true });

  const hubs = useMemo(() => data?.hubs || [], [data]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = hubs.filter((h) => (zone === 'All Zones' || h.zone === zone) && (!term || h.hub.toLowerCase().includes(term)));
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x == null && y == null) return a.hub.localeCompare(b.hub);
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.hub.localeCompare(b.hub);
    });
  }, [hubs, zone, q, sort]);

  if (!data) {
    return (
      <div>
        <div className="ph"><div><div className="kicker">HUB performance · 14 days</div><h1>Hub performance</h1><p className="sub">Hub-level scorecards ranked by first-comment SLA</p></div></div>
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </div>
    );
  }

  const withScore = hubs.filter((h) => h.responseSlaPct != null);
  const avgScore = withScore.length ? Math.round(withScore.reduce((a, h) => a + h.responseSlaPct, 0) / withScore.length) : null;
  const clean = hubs.filter((h) => h.breaches === 0).length;
  const totalBreaches = hubs.reduce((a, h) => a + h.breaches, 0);
  const openTotal = hubs.reduce((a, h) => a + h.open, 0);
  const topHubs = [...withScore].sort((a, b) => b.responseSlaPct - a.responseSlaPct || b.total - a.total || a.hub.localeCompare(b.hub)).slice(0, 5);
  const attention = [...hubs].filter((h) => h.breaches > 0).sort((a, b) => b.breaches - a.breaches || (a.responseSlaPct ?? 101) - (b.responseSlaPct ?? 101) || a.hub.localeCompare(b.hub));

  const th = (key, label) => (
    <th className="sort" style={{ cursor: 'pointer' }} onClick={() => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </th>
  );

  const hubsByVol = [...hubs].sort((a, b) => b.total - a.total || a.hub.localeCompare(b.hub));
  const hubsMed = hubsByVol.filter((h) => h.medianResponseHours != null).slice(0, 6);
  const hubsVol = hubsByVol.slice(0, 8);

  return (
    <div>
      <div className="ph">
        <div>
          <div className="kicker">HUB performance · 14 days</div>
          <h1>Hub performance</h1>
          <p className="sub">{`${fmtN(data.hubCount.withIssues)} hubs with escalations, of ${fmtN(data.hubCount.active)} active · ranked by first-comment SLA`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="seg" role="group" aria-label="Zone">
            {['All Zones', ...ZONES].map((z) => (
              <span key={z} role="button" tabIndex={0} className={zone === z ? 'on' : ''} aria-pressed={zone === z} onClick={() => setZone(z)} onKeyDown={(e) => { if (e.key === 'Enter') setZone(z); }}>{z}</span>
            ))}
          </div>
          <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : 'Refresh'}</button>
          <span className="chip"><span className="live" aria-hidden="true" />Live · synced {formatDhaka(data.generatedAt)}</span>
        </div>
      </div>

      {error && <div className="card" role="alert" style={{ marginBottom: 12 }}>Could not refresh: {error}</div>}

      <Html html={kpiStrip([
        { label: 'Avg hub score', value: avgScore == null ? '—' : `${avgScore}/100`, sub: `${fmtN(withScore.length)} hubs with a first comment`, icon: 'hub' },
        { label: 'Clean hubs', value: fmtN(clean), sub: 'Zero first-comment breaches', icon: 'resolved' },
        { label: 'Total breached', value: fmtN(totalBreaches), sub: 'Across all hubs', icon: 'breach', good: false },
        { label: 'Open backlog', value: fmtN(openTotal), sub: 'Open hub escalations', icon: 'pick' },
      ])} />

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-h"><div><h2>Median first comment by hub</h2><small>Top 6 hubs by volume · target 2h</small></div></div>
          {hubsMed.length === 0 ? <div className="empty">No first comments yet</div> : (
            <Html html={bars({ w: 460, h: 210, items: hubsMed.map((h) => ({ label: h.hub, value: h.medianResponseHours, color: h.medianResponseHours <= 2 ? '#0A7A56' : '#FF5470' })) })} />
          )}
        </div>
        <div className="card">
          <div className="card-h"><div><h2>Volume by hub</h2><small>Escalations raised · top 8 hubs</small></div></div>
          {hubsVol.length === 0 ? <div className="empty">No hub escalations yet</div> : (
            <Html html={hbars(hubsVol.map((h) => ({ label: h.hub, value: h.total })), '#111216')} />
          )}
        </div>
      </div>

      <div className="card mt" style={{ padding: '12px 8px 8px' }}>
        <div className="card-h" style={{ padding: '0 12px' }}>
          <div><h2>Hub scorecard</h2><small>Click a column to sort · filter by name</small></div>
          <div className="search" style={{ flex: '0 1 260px', minWidth: 0, height: 36 }}>
            <input placeholder="Find hub…" aria-label="Find hub" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: 'inherit' }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Hub</th><th>Zone</th>
                {th('total', 'Issues')}{th('open', 'Open')}{th('breaches', 'Breached')}
                <th>Median comment</th>
                {th('responseSlaPct', 'Comment ≤ 2h')}
                {th('resolvedPct', 'Resolved')}
                <th>P1 open</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10}><div className="empty">No hubs match this filter.</div></td></tr>}
              {rows.map((h) => (
                <tr key={h.hub}>
                  <td><b>{h.hub}</b><div className="muted small">{h.division || '—'} · {h.regionalLead || '—'}</div></td>
                  <td><span className="zc">{h.zone || '—'}</span></td>
                  <td className="mono">{fmtN(h.total)}</td>
                  <td className="mono">{fmtN(h.open)}</td>
                  <td className={h.breaches ? 'bad' : 'muted'}>{fmtN(h.breaches)}</td>
                  <td className="mono">{fmtH(h.medianResponseHours)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 140 }}>
                      <Html html={sbar(h.responseSlaPct ?? 0, h.responseSlaPct == null ? '#A3A9B3' : h.responseSlaPct >= 75 ? '#00E5A0' : h.responseSlaPct >= 50 ? '#FFCC00' : '#FF5470')} />
                      <span className="mono">{fmtPct(h.responseSlaPct)}</span>
                    </div>
                  </td>
                  <td className="mono">{fmtPct(h.resolvedPct)}</td>
                  <td className={h.p1Open ? 'bad' : 'muted'}>{fmtN(h.p1Open)}</td>
                  <td><Html html={gradePill(gradeOf(h.responseSlaPct) || '—')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ padding: '0 12px' }}>Hub score = share of first comments within 2 hours of being raised (breaches count against it). Grade: A 90% or more, B 75% or more, C 50% or more, D below 50%.</p>
      </div>

      <div className="grid g3 mt">
        {ZONES.map((z) => {
          const zh = hubs.filter((h) => h.zone === z);
          const scored = zh.filter((h) => h.responseSlaPct != null);
          const score = scored.length ? Math.round(scored.reduce((a, h) => a + h.responseSlaPct, 0) / scored.length) : null;
          const open = zh.reduce((a, h) => a + h.open, 0);
          const br = zh.reduce((a, h) => a + h.breaches, 0);
          const grades = { A: 0, B: 0, C: 0, D: 0 };
          zh.forEach((h) => { const g = gradeOf(h.responseSlaPct); if (g) grades[g]++; });
          return (
            <div key={z} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 130, flex: '0 0 130px' }}><Html html={gauge({ value: score ?? 0, color: ZONE_COLOR[z], center: score == null ? '—' : `${score}%`, sub: 'score', w: 130 })} /></div>
              <div>
                <b style={{ fontSize: 15 }}><span aria-hidden="true" style={{ color: ZONE_COLOR[z] }}>● </span>{z} Zone</b>
                <div className="muted small">{zh.length} hubs · {fmtN(open)} open · {fmtN(br)} breached</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {Object.entries(grades).filter(([, n]) => n > 0).map(([g, n]) => <span key={g} className="pill p-res">{g} × {n}</span>)}
                  {zh.length === 0 && <span className="muted small">No hubs with escalations</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-h"><div><h2>Top performing hubs</h2><small>Highest first-comment SLA</small></div></div>
          {topHubs.length === 0 ? <div className="empty">No hub has a first comment yet.</div> : topHubs.map((h, i) => (
            <div key={h.hub} className="step" style={{ alignItems: 'center' }}>
              <span className="pill p-ok">#{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}><b>{h.hub}</b><div className="muted small">{h.zone || '—'} · {fmtN(h.total)} escalations · median comment {fmtH(h.medianResponseHours)}</div></div>
              <b className="good" style={{ fontSize: 16 }}>{fmtPct(h.responseSlaPct)}</b>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-h"><div><h2>Attention required</h2><small>Most breaches (first comment or resolution)</small></div></div>
          {attention.length === 0 ? <div className="muted"><b>All clear.</b> No hub has a breach right now.</div> : attention.map((h) => (
            <div key={h.hub} className="step" style={{ alignItems: 'center' }}>
              <span className="flag" aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}><b>{h.hub}</b><div className="muted small">{fmtN(h.breaches)} breached · {fmtN(h.open)} open · median comment {fmtH(h.medianResponseHours)}</div></div>
              <b className="bad" style={{ fontSize: 16 }}>{fmtPct(h.responseSlaPct)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
