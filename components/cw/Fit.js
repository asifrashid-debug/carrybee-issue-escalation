'use client';
import { useEffect, useRef, useState } from 'react';

// Draws a chart at the width of its container, so labels and bars keep their real size
// on wide screens instead of being scaled up from a fixed design width.
// render(w) returns the chart HTML for a chart w pixels wide.
// The chart is drawn only after the component mounts in the browser. The server and the
// browser number chart gradients differently, so drawing on the server would not match.
export default function Fit({ render, min = 260, max = 1600 }) {
  const ref = useRef(null);
  const [w, setW] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = (cw) => {
      if (cw > 0) setW(Math.max(min, Math.min(max, Math.floor(cw))));
    };
    apply(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min, max]);

  const html = w == null ? '' : render(w);
  return <div ref={ref} style={{ width: '100%', minWidth: 0 }} dangerouslySetInnerHTML={{ __html: html }} />;
}
