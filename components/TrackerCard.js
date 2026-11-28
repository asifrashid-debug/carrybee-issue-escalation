'use client';
import CopyButton from './CopyButton';
import HiveStatus from './HiveStatus';
import { formatDhaka, hoursSince } from '../lib/time';
import { escalatedLabel } from '../lib/escalateTo.mjs';
import { PRI_PILL, initials, spanText, sla, pickLine, fbText, hubText } from '../lib/trackerCard.mjs';

const BRAND = { flare: '#FF5470', azure: '#37A9FF' };

// One issue as a tracker card (same markup and classes as the main tracker list in app/page.js).
// Used by the IR Issues, Central Sort and TNL tabs. The main tracker keeps its own card with its own buttons.
// extraLines: [{ cls, text }] shown under the standard lines (for example the IR pick and resolve SLA).
// footer: optional node shown last in the card's text (for example a link). Clicks on it do not open the issue.
export default function TrackerCard({ e, onOpen, extraLines = [], footer = null }) {
  const s = sla(e);
  const age = hoursSince(e.submitted_at) || 0;
  const resDays = e.resolution_days || 3;
  const pct = Math.min(100, Math.max(4, (age / (resDays * 24)) * 100));
  const col = s.state === 'br' ? BRAND.flare : s.state === 'risk' ? BRAND.azure : '#00C98D';
  const stCls = s.text === 'Resolved' ? 'p-res' : s.state === 'br' ? 'p-breach' : s.state === 'risk' ? 'p-wait' : 'p-ok';
  const open = () => onOpen(e.issue_id);
  const stop = (ev) => ev.stopPropagation();
  const who = initials(e.email);
  const pl = pickLine(e);
  const fb = fbText(e);

  return (
    <div
      className="qi"
      role="button"
      tabIndex={0}
      aria-label={`Open issue ${e.issue_id}`}
      onClick={open}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } }}
      style={{ marginBottom: 10 }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`pill ${PRI_PILL[e.priority_scale] || 'p-res'}`}>{e.priority_scale || '—'}</span>
          <span className={`pill ${stCls}`}>{s.state === 'br' ? 'SLA breach' : s.state === 'risk' ? 'Due soon' : s.text === 'Resolved' ? 'Resolved' : 'On track'}</span>
          {e.kam_feedback_status === 'Resolved' && <span className="pill p-res">Closed</span>}
          {e.ops_status === 'Completed' && <span className="pill p-res" style={{ fontWeight: 800, color: 'var(--ink)' }}>Completed By Opps</span>}
          {e.channel && <span className="muted small">{e.channel}</span>}
          {e.escalated_to && <span className="pill p-wait" title="Escalated from the tracker card">Escalated to {escalatedLabel(e.escalated_to)}</span>}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="mono">{e.issue_id}</span>
          <b>{e.merchant_name || '—'}</b>
          {e.consignment_id && (
            <span onClick={stop} className="mono muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {e.consignment_id}<CopyButton text={e.consignment_id} label="Copy consignment ID" />
            </span>
          )}
          {e.merchant_name && <span onClick={stop}><CopyButton text={e.merchant_name} label="Copy merchant name" /></span>}
        </div>
        <div className="meta">{e.issue_category || '—'} · {e.zone || '—'}{e.concern_hub ? ` · ${e.concern_hub}` : ''} · <span className="mono">{spanText(age)}</span></div>
        <div style={{ display: 'grid', gap: 3, fontSize: 12.5, marginTop: 6 }}>
          <div className={s.state === 'br' ? 'sla-bad' : s.state === 'risk' ? 'sla-warn' : 'sla-ok'}>{s.text}</div>
          {pl && <div className={pl.cls}>{pl.text}</div>}
          <div className={fb.cls}>{fb.text}</div>
          <div>
            {e.issue_response_datetime ? (
              <span className="hub-resp">
                <span className="pill p-ok">Hub responded</span>{' '}
                <span className="mono muted small">{formatDhaka(e.issue_response_datetime)}</span>
                {hubText(e) && <span title={[e.layer1_response, e.layer2_response, e.layer3_response].filter(Boolean).join(' | ')} className="muted small"> · {hubText(e)}</span>}
              </span>
            ) : <span className="muted small">Awaiting hub response</span>}
          </div>
          {extraLines.map((l, i) => <div key={i} className={l.cls}>{l.text}</div>)}
          {footer && <div onClick={stop}>{footer}</div>}
        </div>
        <div className="bar"><i style={{ width: `${pct}%`, background: col }} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        <div onClick={stop} onKeyDown={(ev) => ev.stopPropagation()}>
          <HiveStatus consignmentId={e.consignment_id} />
        </div>
        <span className="avatar" title="Raised by" aria-label={`Raised by ${who}`}>{who}</span>
        <span className="btn primary" style={{ height: 32, fontSize: 12.5 }}>Open</span>
      </div>
    </div>
  );
}
