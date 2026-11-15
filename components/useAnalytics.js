'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAnalytics() {
  const [mode, setMode] = useState('live');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Honour ?sample=1 on first load so previews can be shared as links.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('sample') === '1') setMode('sample');
  }, []);

  // Ignore responses from superseded requests so a slow live fetch cannot overwrite sample data (or vice versa).
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const r = await fetch(`/api/analytics${mode === 'sample' ? '?sample=1' : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (id !== latest.current) return;
      if (!r.ok) throw new Error(j.error || 'Failed to load analytics');
      setData({ ...j, _mode: mode });
      setError(null);
    } catch (e) {
      if (id !== latest.current) return;
      setError(String(e.message || e));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  return { data, error, loading, mode, setMode, reload: load };
}
