'use client';
import { useEffect, useRef, useState } from 'react';
import { useDateRange } from './useDateRange';
import { PRESETS, dhakaDay, rangeLabel } from '../../lib/dateRange';

// Calendar filter for the escalation tabs. Presets, or a From and To date (native calendar picker).
export default function DateRangeFilter() {
  const { range, choose } = useDateRange();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const wrap = useRef(null);
  const today = dhakaDay();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open) { setFrom(range.from || ''); setTo(range.to || ''); }
    setOpen(!open);
  }
  function applyCustom() {
    if (!from && !to) return;
    choose({ key: 'custom', from, to });
    setOpen(false);
  }

  return (
    <div className="dr" ref={wrap}>
      <button type="button" className="btn dr-btn" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        {rangeLabel(range)}
      </button>
      {open && (
        <div className="dr-pop" role="dialog" aria-label="Choose date range">
          <div className="dr-presets">
            <button type="button" className={range.key === 'all' ? 'on' : ''} onClick={() => { choose({ key: 'all' }); setOpen(false); }}>All time</button>
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className={range.key === p.key ? 'on' : ''} onClick={() => { choose({ key: p.key }); setOpen(false); }}>{p.label}</button>
            ))}
          </div>
          <div className="dr-custom">
            <label>From<input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To<input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className="dr-actions">
            <button type="button" className="btn" onClick={() => { choose({ key: 'all' }); setOpen(false); }}>Clear</button>
            <button type="button" className="submit" disabled={!from && !to} onClick={applyCustom}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
