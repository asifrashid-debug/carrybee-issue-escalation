'use client';
import { useMemo, useState } from 'react';
import { useAnalytics } from '../../components/useAnalytics';
import { PageHead, Kpi, Seg, LiveChip, Bar, GradePill, Zc, fmtN, fmtPct, fmtH } from '../../components/demo';
import { HBars, Gauge } from '../../components/charts';
import { formatDhaka } from '../../lib/time';

const ZONE_COLOR = { ISD: '#F8C800', OSD: '#3B9CFF', CTG: '#A78BFA' };
const ZONES = ['ISD', 'OSD', 'CTG'];

// HUB Performance (demo layout). Hub score = share of first comments within 2h (grade A ≥90, B ≥75, C ≥50, D below).
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
      <div className="dm dchart">
        <PageHead kicker="HUB performance · 14 days" title="Hub performance" sub="Hub-level scorecards ranked by first-comment SLA" />
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
  const attention = [...hubs].sort((a, b) => b.breaches - a.breaches || (a.responseSlaPct ?? 101) - (b.responseSlaPct ?? 101) || a.hub.localeCompare(b.hub)).filter((h) => h.breaches > 0 || (h.responseSlaPct != null && h.responseSlaPct < 75)).slice(0, 5);

  const th = (key, label) => (
    <th className="sort" onClick={() => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </th>
  );

  // Demo order: median first comment and volume by hub (real data, top hubs by volume).
  const hubsByVol = [...data.hubs].sort((a, b) => b.total - a.total || a.hub.localeCompare(b.hub));
  const hubsMed = hubsByVol.filter((h) => h.medianResponseHours != null).slice(0, 6);
  const maxMed = Math.max(2, ...hubsMed.map((h) => h.medianResponseHours));
  const hubsVol = hubsByVol.slice(0, 8);
  const maxVol = Math.max(1, ...hubsVol.map((h) => h.total));

  return (
    <div className="dm">
      <PageHead kicker="HUB performance · 14 days" title="Hub performance" sub={`${fmtN(data.hubCount.withIssues)} hubs with escalations, of ${fmtN(data.hubCount.active)} active · ranked by first-comment SLA · all escalations in your scope`}>
        <Seg label="Zone" items={['All Zones', ...ZONES]} value={zone} onChange={setZone} />
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
        <LiveChip label={`Live · synced ${formatDhaka(data.generatedAt)}`} />
      </PageHead>

      {error && <div className="box box-bad" role="alert">Could not refresh: {error}</div>}

      <div className="grid g4 kpi-strip">
        <Kpi label="Avg hub score" value={<>{avgScore ?? '—'}<small>{avgScore == null ? '' : '/100'}</small></>} sub={`${fmtN(withScore.length)} hubs with a first comment`} icon="trophy" />
        <Kpi label="Clean hubs" value={fmtN(clean)} sub="Zero first-comment breaches" icon="shield" tone="g" />
        <Kpi label="Total breached" value={fmtN(totalBreaches)} sub="Across all hubs" icon="alert" tone="r" hot={totalBreaches > 0} />
        <Kpi label="Open backlog" value={fmtN(openTotal)} sub="Open hub escalations" icon="clock" tone="b" />
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="ph"><div><h3>Median First Comment by Hub</h3><small>Top 6 hubs by volume · target 2h</small></div></div>
          {hubsMed.length === 0 ? <div className="empty">No first comments yet</div> : (
            <HBars format={(v) => fmtH(v)} rows={hubsMed.map((h) => ({ label: h.hub, value: h.medianResponseHours, color: h.medianResponseHours <= 2 ? '#0A7A56' : '#FF5470' }))} />
          )}
        </div>
        <div className="card">
          <div className="ph"><div><h3>Volume by Hub</h3><small>Escalations raised · top 8 hubs</small></div></div>
          {hubsVol.length === 0 ? <div className="empty">No hub escalations yet</div> : (
            <HBars rows={hubsVol.map((h) => ({ label: h.hub, value: h.total, color: '#FFCC00' }))} />
          )}
        </div>
      </div>

      <div className="card">
        <div className="ph">
          <div><h3>Hub Scorecard</h3><small>Click a column to sort · filter by name</small></div>
          <div className="search" style={{ flex: '0 1 260px', padding: '7px 10px' }}>
            <input placeholder="Find hub…" aria-label="Find hub" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {/* Phone: column headers are hidden, so sorting moves to this select (same state as the headers). */}
        <div className="only-phone" style={{ marginBottom: 12 }}>
          <label htmlFor="hub-sort" className="flabel">Sort hubs by</label>
          <div className="fctl"><select id="hub-sort" value={`${sort.key}:${sort.desc ? 'desc' : 'asc'}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, desc: dir === 'desc' }); }}>
            <option value="total:desc">Issues</option>
            <option value="open:desc">Open</option>
            <option value="breaches:desc">Breached</option>
            <option value="responseSlaPct:desc">Comment ≤ 2h (best first)</option>
            <option value="responseSlaPct:asc">Comment ≤ 2h (worst first)</option>
            <option value="resolvedPct:desc">Resolved</option>
          </select></div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
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
                  <td><b>{h.hub}</b><div className="sub">{h.division || '—'} · {h.regionalLead || '—'}</div></td>
                  <td><Zc z={h.zone} /></td>
                  <td>{fmtN(h.total)}</td>
                  <td className="y">{fmtN(h.open)}</td>
                  <td className={h.breaches ? 'bad' : ''}>{fmtN(h.breaches)}</td>
                  <td>{fmtH(h.medianResponseHours)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 120 }}>
                      <Bar pct={h.responseSlaPct ?? 0} color={h.responseSlaPct == null ? 'var(--mut)' : h.responseSlaPct >= 75 ? '#3DDC97' : h.responseSlaPct >= 50 ? '#F8C800' : '#FF5D73'} />
                      <b>{fmtPct(h.responseSlaPct)}</b>
                    </div>
                  </td>
                  <td>{fmtPct(h.resolvedPct)}</td>
                  <td className={h.p1Open ? 'bad' : ''}>{fmtN(h.p1Open)}</td>
                  <td><GradePill pct={h.responseSlaPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note">Hub score = share of first comments within 2 hours of being raised (breaches count against it). Grade: A 90% or more, B 75% or more, C 50% or more, D below 50%.</div>
      </div>

      <div className="grid g3">
        {ZONES.map((z) => {
          const zh = hubs.filter((h) => h.zone === z);
          const scored = zh.filter((h) => h.responseSlaPct != null);
          const score = scored.length ? Math.round(scored.reduce((a, h) => a + h.responseSlaPct, 0) / scored.length) : null;
          const open = zh.reduce((a, h) => a + h.open, 0);
          const br = zh.reduce((a, h) => a + h.breaches, 0);
          const grades = { A: 0, B: 0, C: 0, D: 0 };
          zh.forEach((h) => { const g = h.responseSlaPct == null ? null : h.responseSlaPct >= 90 ? 'A' : h.responseSlaPct >= 75 ? 'B' : h.responseSlaPct >= 50 ? 'C' : 'D'; if (g) grades[g]++; });
          return (
            <div key={z} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 130, flex: '0 0 130px' }}><Gauge value={score ?? 0} color={ZONE_COLOR[z]} center={score == null ? '—' : `${score}%`} sub="score" w={130} /></div>
              <div>
                <b style={{ fontSize: 15, color: ZONE_COLOR[z] }}>● {z} Zone</b>
                <div className="ks">{zh.length} hubs · {fmtN(open)} open · {fmtN(br)} breached</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {Object.entries(grades).filter(([, n]) => n > 0).map(([g, n]) => <span key={g} className={`pillc p-${g}`}>{g} × {n}</span>)}
                  {zh.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No hubs with escalations</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid g2e">
        <div className="card">
          <div className="ph"><div><h3>Top Performing Hubs</h3><small>Highest first-comment SLA</small></div></div>
          {topHubs.length === 0 ? <div className="empty">No hub has a first comment yet.</div> : (
            <div className="lst">
              {topHubs.map((h, i) => (
                <div key={h.hub} className="lrow">
                  <span className="pillc p-ok">#{i + 1}</span>
                  <div><div className="n">{h.hub}</div><div className="s">{h.zone || '—'} · {fmtN(h.total)} escalations · median comment {fmtH(h.medianResponseHours)}</div></div>
                  <div className="r" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><GradePill pct={h.responseSlaPct} /><b className="good" style={{ fontSize: 16 }}>{fmtPct(h.responseSlaPct)}</b></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card hot">
          <div className="ph"><div><h3>Attention Required</h3><small>Most breaches (first comment or resolution)</small></div></div>
          {attention.length === 0 ? <div className="empty"><b>All clear</b>No hub has a breach right now.</div> : (
            <div className="lst">
              {attention.map((h) => (
                <div key={h.hub} className="lrow" style={{ borderColor: 'rgba(255,93,115,.3)' }}>
                  <div><div className="n">{h.hub}</div><div className="s">{fmtN(h.breaches)} breached · {fmtN(h.open)} open · median comment {fmtH(h.medianResponseHours)}</div></div>
                  <div className="r" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><GradePill pct={h.responseSlaPct} /><b className="bad" style={{ fontSize: 16 }}>{fmtPct(h.responseSlaPct)}</b></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
