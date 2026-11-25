'use client';
import { useCallback, useEffect, useState } from 'react';
import { unseenTrackerItems, parseSeenMap, trackerSeenKey, withSeen, layerFingerprint, hasLayerResponse } from '../lib/trackerBadge.mjs';

const EVENT = 'cb-tracker-seen';
const POLL_MS = 60000;

function readSeen(viewer) {
  try {
    return parseSeenMap(localStorage.getItem(trackerSeenKey(viewer)));
  } catch (e) {
    return {};
  }
}

// Called by the Tracker drawer when an issue loads. Records the issue's current layer-response fingerprint for this viewer.
export function markTrackerSeen(viewerEmail, esc) {
  if (!viewerEmail || !esc?.issue_id || !hasLayerResponse(esc)) return;
  try {
    const key = trackerSeenKey(viewerEmail);
    const next = withSeen(parseSeenMap(localStorage.getItem(key)), esc.issue_id, layerFingerprint(esc));
    localStorage.setItem(key, JSON.stringify(next));
  } catch (e) {
    return; // storage unavailable: the issue stays counted
  }
  window.dispatchEvent(new Event(EVENT));
}

// Header badge for the Tracker tab: unseen MX issues with a layer response that name this viewer.
// Separate from the Ops-KAM badge. Refreshes every 60 seconds and after markTrackerSeen.
export function useTrackerBadge(enabled) {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await fetch('/api/tracker-badge', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setCount(unseenTrackerItems(d.items || [], readSeen(d.viewer)).length);
    } catch (e) {
      /* offline: keep the last count */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return undefined;
    }
    load();
    const t = setInterval(load, POLL_MS);
    window.addEventListener(EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENT, load);
    };
  }, [enabled, load]);

  return count;
}
