'use client';
import { useState } from 'react';
import DateRangeFilter from './cw/DateRangeFilter';
import Fit from './cw/Fit';
import { wave, hbars, donut, gauge, legend, kpiStrip } from './cw/chartlib';
import { fmtN, fmtPct } from './cw/format';
import { useRangeAnalytics } from './cw/useRangeAnalytics';
import { rangeLabel, rangePhrase } from '../lib/dateRange';
import { formatDhaka } from '../lib/time';
import { OPS_SOURCE_TABS } from '../lib/opsIssues.mjs';

// OPS-KAM analytics for each source tab (HUB, IR, Sort, TNL). Same layout as the Central Sort and TNL analytics.
// Data: GET /api/kam/analytics?source=... (same visibility as the Ops-KAM list; range applies to raised time).
const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const STATUS_COLOR = { Raised: '#FF5470', Picked: '#FFCC00', 'In Progress': '#FFB020', Resolved: '#00E5A0', 'Not Resolved': '#9B9B9B', 'Not set': '#CFCBBE' };
const VALIDATION_PALETTE = ['#37A9FF', '#A78BFA', '#00E5A0', '#FFCC00', '#FF5470', '#CFCBBE'];
const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : null);
const gaugeColor = (p) => (p != null && p >= 85 ? '#0A7A56' : '#FFCC00');
const onTimeColor = (p) => (p == null ? '#A3A1A8' : p >= 90 ? '#00E5A0' : p >= 75 ? '#FFCC00' : '#FF5470');

// The tab switcher. The four source tabs only; All issues has no separate analytics.
export default function OpsKamSourceAnalytics() {
  const sources = OPS_SOURCE_TABS.filter((t) => t.key !== 'all');
  const [source, setSource] = useState(sources[0].key);
  const current = sources.find((s) => s.key === source);
  return (
    <div id="kam-analytics" className="trk-page" style={{ padding: '12px 24px 0' }}>
      <div className="chips" role="tablist" aria-label="Analytics source" style={{ marginBottom: 12 }}>
        {sources.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={source === s.key} className={`chip${source === s.key ? ' on' : ''}`} onClick={() => setSource(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <OpsKamSourceSection key={source} source={source} label={current.label.replace(' Issues', '')} />
    </div>
  );
}

function OpsKamSourceSection({ source, label }) {
  const { data, error, loading, range, reload } = useRangeAnalytics('/api/kam/analytics', `source=${encodeURIComponent(source)}`);

  const toolbar = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <div>
        <div className="kicker">{`OPS-KAM ${label} analytics · ${rangeLabel(range)}`}</div>
        <h2 style={{ margin: 0 }}>{label} issues</h2>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <DateRangeFilter />
        <button type="button" className="btn" onClick={reload} disabled={loading} aria-label={`Refresh ${label} analytics`}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        {data && <span className="chip"><span className="live" aria-hidden="true" />Live · synced {formatDhaka(data.generated_at)}</span>}
      </div>
    </div>
  );

  if (!data) {
    return (
      <section aria-label={`${label} analytics`}>
        {toolbar}
        {error ? <div className="box box-bad" role="alert"><b>Could not load data.</b> {error}</div> : <div className="empty">{loading ? 'Loading live data…' : 'Waiting for data'}</div>}
      </section>
    );
  }

  const statusVal = (name) => data.status.find((s) => s.label === name)?.value || 0;
  const valNotSet = data.validation.find((s) => s.label === 'Not set')?.value || 0;
  const onTimePct = pctOf(data.total - data.late, data.total);
  const closedPct = pctOf(data.closed, data.total);
  const feedbackPct = pctOf(data.feedback_added, data.total);
  const labels = data.trend.labels.map((l) => l.split('-').reverse().join(' '));
  const every = labels.length > 30 ? 7 : labels.length > 14 ? 2 : 1;
  const slaItems = [
    { label: 'Open, inside target', value: data.sla.pending, color: '#37A9FF' },
    { label: 'Open, past target', value: data.sla.breached, color: '#FF5470' },
    { label: 'Closed', value: data.sla.closed, color: '#00E5A0' },
  ];
  const statusSegs = data.status.filter((s) => s.value > 0).map((s) => ({ label: s.label, value: s.value, color: STATUS_COLOR[s.label] || '#A3A1A8' }));
  const valColor = (s, i) => (s.label === 'Not set' ? STATUS_COLOR['Not set'] : VALIDATION_PALETTE[i % VALIDATION_PALETTE.length]);
  const valSegs = data.validation.filter((s) => s.value > 0).map((s, i) => ({ label: s.label, value: s.value, color: valColor(s, i) }));

  return (
    <section aria-label={`${label} analytics`}>
      {toolbar}
      {error && <div className="card" role="alert" style={{ marginBottom: 12 }}>Could not refresh: {error}</div>}
      <div style={{ opacity: loading ? 0.6 : 1 }}>
        <Html html={kpiStrip([
          { label: `${label} issues`, value: fmtN(data.total), sub: `${fmtN(data.open)} open · ${fmtN(data.closed)} closed`, icon: 'truck' },
          { label: 'Raised, not picked', value: fmtN(statusVal('Raised')), sub: 'Still at Raised', icon: 'escalation' },
          { label: 'Past target', value: fmtN(data.late), sub: 'Pick or resolve window passed', icon: 'breach', good: false },
          { label: 'Feedback added', value: fmtN(data.feedback_added), sub: `of ${fmtN(data.total)} issues`, icon: 'sync' },
        ])} />

        <div className="card mt">
          <div className="card-h">
            <div><h2>Issues raised per day</h2><small>{`${label} issues, ${rangePhrase(range)} (Dhaka)`}</small></div>
            <Html html={legend([{ c: '#2F6FDB', l: 'Raised' }])} />
          </div>
          <Fit render={(w) => wave({ w, labels, every, label: `${label} issues raised per day`, bg: '#FFFFFF', h: 240, series: [
            { data: data.trend.values, color: '#2F6FDB', fillOpacity: 0.14 },
          ] })} />
        </div>

        <div className="grid g2 mt">
          <div className="card">
            <div className="card-h"><div><h2>Status</h2><small>Ops-KAM issue status</small></div></div>
            <DonutRows total={data.total} segs={statusSegs} rows={data.status} colorOf={(s) => STATUS_COLOR[s.label] || '#A3A1A8'} />
          </div>
          <div className="card">
            <div className="card-h"><div><h2>Validation</h2><small>Set by the KAM</small></div></div>
            <DonutRows total={data.total} segs={valSegs} rows={data.validation} colorOf={(s) => valColor(s, data.validation.indexOf(s))} />
          </div>
        </div>

        <div className="grid g2 mt">
          <div className="card">
            <div className="card-h"><div><h2>Resolution target</h2><small>Category days from raised</small></div></div>
            <Html html={hbars(slaItems, '#111216')} />
          </div>
          <div className="card">
            <div className="card-h"><div><h2>Top categories</h2><small>Share of {label} issues</small></div></div>
            {data.categories.length === 0 ? <div className="empty">No categories yet</div> : (
              <Html html={hbars(data.categories.map((c) => ({ label: c.label, value: c.total, color: '#2F6FDB' })), '#2F6FDB')} />
            )}
          </div>
        </div>

        <div className="grid g3 mt">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Within target</h2><small>Not past the pick and resolve windows</small></div></div>
            <Html html={gauge({ value: onTimePct ?? 0, color: onTimeColor(onTimePct), center: onTimePct == null ? '—' : `${onTimePct}%`, sub: `${fmtN(data.late)} past target`, w: 200 })} />
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Closed</h2><small>{`${fmtN(data.closed)} of ${fmtN(data.total)} issues`}</small></div></div>
            <Html html={gauge({ value: closedPct ?? 0, color: gaugeColor(closedPct), center: closedPct == null ? '—' : `${closedPct}%`, sub: 'Resolved or Not Resolved', w: 200 })} />
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-h" style={{ justifyContent: 'center' }}><div><h2>Feedback added</h2><small>KAM feedback written</small></div></div>
            <Html html={gauge({ value: feedbackPct ?? 0, color: gaugeColor(feedbackPct), center: feedbackPct == null ? '—' : `${feedbackPct}%`, sub: `${fmtN(data.total - data.feedback_added)} without feedback`, w: 200 })} />
          </div>
        </div>

        <div className="grid g2 mt">
          <div className="card" style={{ padding: '12px 8px 8px' }}>
            <div className="card-h" style={{ padding: '0 12px' }}><div><h2>By zone</h2><small>Issues, open and past target</small></div></div>
            {data.zones.length === 0 ? <div className="empty">No issues in this period</div> : (
              <table>
                <thead><tr><th>Zone</th><th>Issues</th><th>Open</th><th>Past target</th><th>On time</th></tr></thead>
                <tbody>
                  {data.zones.map((z) => (
                    <tr key={z.label}>
                      <td>{z.label}</td>
                      <td className="mono">{fmtN(z.total)}</td>
                      <td className="mono">{fmtN(z.open)}</td>
                      <td className="mono" style={{ color: z.late ? '#FF5470' : undefined, fontWeight: z.late ? 700 : 400 }}>{fmtN(z.late)}</td>
                      <td className="mono">{fmtPct(pctOf(z.total - z.late, z.total) ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card" style={{ padding: '12px 8px 8px' }}>
            <div className="card-h" style={{ padding: '0 12px' }}><div><h2>Top HUBs</h2><small>Top 10 by issues</small></div></div>
            {data.hubs.length === 0 ? <div className="empty">No issues in this period</div> : (
              <table>
                <thead><tr><th>HUB</th><th>Issues</th><th>Open</th><th>Past target</th></tr></thead>
                <tbody>
                  {data.hubs.map((h) => (
                    <tr key={h.label}>
                      <td>{h.label}</td>
                      <td className="mono">{fmtN(h.total)}</td>
                      <td className="mono">{fmtN(h.open)}</td>
                      <td className="mono" style={{ color: h.late ? '#FF5470' : undefined, fontWeight: h.late ? 700 : 400 }}>{fmtN(h.late)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card mt">
          <div className="card-h"><div><h2>Attention counts</h2><small>Issues in this period</small></div></div>
          <div className="grid g4">
            {[['Past target', data.late], ['Still at Raised', statusVal('Raised')], ['Validation not set', valNotSet], ['No KAM feedback', data.total - data.feedback_added]].map(([l, v]) => (
              <div key={l} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span className="small">{l}</span><b>{fmtN(v)}</b></div>
            ))}
          </div>
          <p className="note">
            Past target = open and the pick window (30 minutes) or the resolve window (24 hours) has passed. Same rule as the Overdue count on the OPS-KAM page.
          </p>
        </div>
      </div>
    </section>
  );
}

// Donut plus a list of every value with its count, the same layout as the Central Sort and TNL analytics.
function DonutRows({ total, segs, rows, colorOf }) {
  if (total === 0) return <div className="empty">No issues in this period</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <Html html={donut({ segments: segs, center: fmtN(total), sub: 'issues', size: 160, stroke: 20 })} />
      <div className="stack" style={{ gap: 10, flex: '1 1 180px', minWidth: 0 }}>
        {rows.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: colorOf(s), flex: '0 0 auto' }} />
            <span>{s.label}</span>
            <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtN(s.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
