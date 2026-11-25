'use client';
import { useCallback, useEffect, useState } from 'react';
import { raisedIssueIds, unseenCount, seenStorageKey, parseSeen } from '../lib/opsBadge.mjs';

const EVENT = 'cb-ops-seen';
const POLL_MS = 60000;

function readSeen(viewer) {
  try {
    return parseSeen(localStorage.getItem(seenStorageKey(viewer)));
  } catch (e) {
    return [];
  }
}

// Called by the Ops-KAM page after a successful load: every issue still at Raised counts as seen.
// Saved per browser (localStorage). It is not shared across devices.
export function markOpsIssuesSeen(viewer, issues) {
  try {
    localStorage.setItem(seenStorageKey(viewer), JSON.stringify(raisedIssueIds(issues)));
  } catch (e) {
    return; // storage unavailable: the badge stays until the next successful save
  }
  window.dispatchEvent(new Event(EVENT));
}

// Header badge: how many Ops Issues are new (Raised and not yet seen) for the signed-in viewer.
// Only runs when the viewer can open the Ops-KAM tab. Refreshes every 60 seconds and after markOpsIssuesSeen.
export function useOpsBadge(enabled) {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await fetch('/api/ops-issues', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setCount(unseenCount(d.issues || [], readSeen(d.viewer)));
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
