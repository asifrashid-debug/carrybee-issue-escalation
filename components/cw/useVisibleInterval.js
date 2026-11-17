'use client';
import { useEffect, useRef } from 'react';

// Runs fn every ms while the tab is visible, so background tabs stop polling.
// When the tab comes back and the last run is older than ms, it runs once straight away.
export function useVisibleInterval(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let last = Date.now();
    const run = () => { last = Date.now(); ref.current(); };
    const t = setInterval(() => { if (!document.hidden) run(); }, ms);
    const onVis = () => { if (!document.hidden && Date.now() - last >= ms) run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [ms]);
}
