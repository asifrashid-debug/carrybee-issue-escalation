'use client';
import { useCallback, useEffect, useState } from 'react';
import { resolveRange } from '../../lib/dateRange';

// One date range for every escalation tab. It is saved in this browser, so it carries across tabs and survives a refresh.
const KEY = 'cb-range';
const EVT = 'cb-range-change';
const ALL = resolveRange(null);

function read() {
  try { return resolveRange(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return ALL; }
}

export function useDateRange() {
  const [range, setRange] = useState(ALL);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setRange(read());
    sync();
    setReady(true);
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);
  // next is { key } for a preset or All time, or { key: 'custom', from, to }
  const choose = useCallback((next) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep it for this view only */ }
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { range, ready, choose };
}
