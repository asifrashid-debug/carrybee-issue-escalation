'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Live data only. Generated sample figures are not shown on any tracker page.
export function useAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ignore responses from superseded requests so a slow earlier response cannot overwrite a newer one.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const r = await fetch('/api/analytics', { cache: 'no-store' });
      const j = await r.json();
      if (id !== latest.current) return;
      if (!r.ok) throw new Error(j.error || 'Failed to load analytics');
      setData({ ...j, _mode: 'live' });
      setError(null);
    } catch (e) {
      if (id !== latest.current) return;
      setError(String(e.message || e));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  return { data, error, loading, reload: load };
}
