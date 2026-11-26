'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDateRange } from './useDateRange';

// Loads one analytics endpoint for the shared date range (same from/to rule as useAnalytics).
// extra: extra query string, e.g. 'route=tnl'. Responses from superseded requests are ignored.
export function useRangeAnalytics(path, extra = '') {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const { range, ready } = useDateRange();
  const { from, to } = range;

  const load = useCallback(async () => {
    if (!ready) return;
    const id = ++latest.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams(extra);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r = await fetch(`${path}?${qs}`, { cache: 'no-store' });
      const j = await r.json();
      if (id !== latest.current) return;
      if (!r.ok) throw new Error(j.error || 'Could not load the analytics');
      setData(j);
      setError(null);
    } catch (e) {
      if (id !== latest.current) return;
      setError(String(e.message || e));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [ready, from, to, path, extra]);

  useEffect(() => { load(); }, [load]);
  return { data, error, loading, range, reload: load };
}
