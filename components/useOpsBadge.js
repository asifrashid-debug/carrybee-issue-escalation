'use client';
import { useCallback, useEffect, useState } from 'react';
import { unseenCount, seenStorageKey, parseSeen, nextSeenIds } from '../lib/opsBadge.mjs';

const EVENT = 'cb-ops-seen';
const POLL_MS = 60000;

function readSeen(viewer) {
  try {
    return parseSeen(localStorage.getItem(seenStorageKey(viewer)));
  } catch (e) {
    return [];
  }
}

// Seen ids for this viewer in this browser (localStorage). Not shared across devices.
export function readOpsSeen(viewer) {
  return readSeen(viewer);
}

// Called when a source tab is opened: the Raised issues shown in that tab count as seen. Other tabs keep their seen state.
// Returns the new seen list and tells the header badge to refresh.
export function markOpsIssuesSeen(viewer, allIssues, shownIssues) {
  const next = nextSeenIds(allIssues, readSeen(viewer), shownIssues);
  try {
    localStorage.setItem(seenStorageKey(viewer), JSON.stringify(next));
  } catch (e) {
    return next; // storage unavailable: the badge stays until the next successful save
  }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

// Header badge: how many Ops Issues are new (Raised and not yet seen) for the signed-in viewer, across all tabs.
// Only runs when the viewer can open the Ops-KAM tab. Refreshes every 60 seconds and after markOpsIssuesSeen.
export function useOpsBadge(enabled) {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      // size=1: the badge only needs the Raised references, not a page of issues.
      const r = await fetch('/api/ops-issues?size=1', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setCount(unseenCount(d.raised || [], readSeen(d.viewer)));
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
