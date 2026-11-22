'use client';
import { wave, hbars, kpiStrip } from './cw/chartlib';
import Fit from './cw/Fit';
import { fmtN, fmtPct, fmtH } from './cw/format';

// Ops-KAM section of the Analytics page. Data: data.opsKam from /api/analytics (lib/opsKamAnalytics.mjs).
// Viewers who are not admin get no per-KAM table (data.kams is removed on the server).

const Html = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
const STATUS_COLOR = { Raised: '#FF5470', Picked: '#FFCC00', 'In Progress': '#FFB020', Resolved: '#00E5A0', 'Not Resolved': '#9B9B9B' };
const VALIDATION_COLOR = { Valid: '#00E5A0', Invalid: '#FF5470', Duplicate: '#A78BFA', 'No proper info': '#FFB020', 'Not validated': '#CFCBBE' };
const good = (p) => (p == null ? '' : p >= 90 ? 'good' : p >= 75 ? '' : 'bad');

export default function OpsKamAnalytics({ data, rangeText }) {
  if (!data) return null;
  if (data.error) {
    return (
      <div className="card mt">
        <div className="card-h"><div><h2>Ops-KAM</h2><small>Ops Issues</small></div></div>
        <div className="box box-bad"><b>Ops-KAM data unavailable.</b> {data.error}</div>
      </div>
    );
  }

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const labels = data.trend.map((d) => d.date.slice(5).split('-').reverse().join(' '));

  return (
    <section className="mt" aria-label="Ops-KAM analytics">
      <div className="ph" style={{ marginBottom: 12 }}>
        <div>
          <div className="kicker">{`Ops-KAM · Ops Issues · ${rangeText}`}</div>
          <h2 style={{ margin: 0 }}>Ops-KAM analytics</h2>
          <p className="sub">Raised, picked, closed and validated Ops Issues. Pick within {data.pickWindowMin} min, close within {data.closeWindowH} h, both from Raised.</p>
        </div>
      </div>

      {data.total === 0 ? (
        <div className="card"><div className="empty">No Ops-KAM issues raised in this range</div></div>
      ) : (
        <>
          <Html html={kpiStrip([
            { label: 'Raised', value: fmtN(data.total), sub: `${fmtN(data.closed)} closed · ${fmtPct(pct(data.closed, data.total))}`, icon: 'escalation' },
            { label: 'Open', value: fmtN(data.open), sub: `${fmtN(data.toPick)} waiting to be picked`, icon: 'followup' },
            { label: 'Overdue', value: fmtN(data.overdue), sub: 'Open past a pick or close window', icon: 'breach', good: false },
            { label: 'Picked on time', value: fmtPct(data.pickOnTimePct), sub: data.medianPickMinutes == null ? 'No picks yet' : `Median ${data.medianPickMinutes} min`, icon: 'sla' },
            { label: 'Closed on time', value: fmtPct(data.closeOnTimePct), sub: data.medianCloseHours == null ? 'No closures yet' : `Median ${fmtH(data.medianCloseHours)}`, icon: 'sla' },
          ])} />

          <div className="card mt">
            <div className="card-h"><div><h2>Raised and closed per day</h2><small>{rangeText} (Dhaka)</small></div></div>
            <Fit render={(w) => wave({ w, labels, every: 1, label: 'Ops-KAM raised and closed', bg: '#FFFFFF', h: 220, series: [
              { data: data.trend.map((d) => d.raised), color: '#FF5470', fillOpacity: 0.1 },
              { data: data.trend.map((d) => d.closed), color: '#0A7A56', fillOpacity: 0.18 },
            ] })} />
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-h"><div><h2>Status</h2><small>Share of Ops-KAM issues in range</small></div></div>
              <Html html={hbars(data.statuses.map((s) => ({ label: s.label, value: s.count, color: STATUS_COLOR[s.label] || '#CFCBBE' })), '#111216')} />
            </div>
            <div className="card">
              <div className="card-h"><div><h2>Validation</h2><small>{`${fmtPct(data.validatedPct)} of issues validated by the KAM`}</small></div></div>
              <Html html={hbars(data.validations.map((v) => ({ label: v.label, value: v.count, color: VALIDATION_COLOR[v.label] || '#CFCBBE' })), '#111216')} />
            </div>
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-h"><div><h2>Zones</h2><small>From the sheet each issue came from</small></div></div>
              <table>
                <thead><tr><th>Zone</th><th>Raised</th><th>Open</th><th>Overdue</th><th>Picked on time</th></tr></thead>
                <tbody>
                  {data.zones.map((z) => (
                    <tr key={z.zone}>
                      <td>{z.zone}</td>
                      <td className="mono">{fmtN(z.total)}</td>
                      <td className="mono">{fmtN(z.open)}</td>
                      <td className="mono">{fmtN(z.overdue)}</td>
                      <td className={`mono ${good(z.pickOnTimePct)}`}>{fmtPct(z.pickOnTimePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="card-h"><div><h2>Categories</h2><small>Uploaded later; until then, not categorised</small></div></div>
              <table>
                <thead><tr><th>Category</th><th>Count</th><th>Share</th></tr></thead>
                <tbody>
                  {data.categories.slice(0, 8).map((c) => (
                    <tr key={c.label}><td>{c.label}</td><td className="mono">{fmtN(c.count)}</td><td className="mono">{pct(c.count, data.total)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.kams && (
            <div className="card mt">
              <div className="card-h"><div><h2>By KAM</h2><small>Admin only · named on each Ops Issue</small></div></div>
              <table>
                <thead><tr><th>KAM</th><th>Raised</th><th>Open</th><th>Overdue</th><th>Picked on time</th><th>Closed on time</th><th>Validated</th></tr></thead>
                <tbody>
                  {data.kams.map((k) => (
                    <tr key={k.kam}>
                      <td>{k.kam}</td>
                      <td className="mono">{fmtN(k.total)}</td>
                      <td className="mono">{fmtN(k.open)}</td>
                      <td className="mono">{fmtN(k.overdue)}</td>
                      <td className={`mono ${good(k.pickOnTimePct)}`}>{fmtPct(k.pickOnTimePct)}</td>
                      <td className={`mono ${good(k.closeOnTimePct)}`}>{fmtPct(k.closeOnTimePct)}</td>
                      <td className="mono">{fmtPct(k.validatedPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="note">Timing figures count only issues that have reached that step. Pick and close are measured from Raised, the time the sync first saw the row.</p>
        </>
      )}
    </section>
  );
}
