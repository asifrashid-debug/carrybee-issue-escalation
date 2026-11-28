// OPS-KAM list view: counts, filter, search, sort and paging over the viewer's visible issues.
// Pure logic. Used by GET /api/ops-issues (server) and by the list page's tests.
// The visibility rule (who may see which issue) is NOT here. It runs first, in visibleOpsIssues (lib/opsIssues.mjs).
import { inOpsSourceTab, sortOpsIssues, OPS_SOURCE_TABS } from './opsIssues.mjs';
import { dueState, CLOSED_STATUSES } from './opsLifecycle.mjs';

export const LIST_FILTERS = ['all', 'pick', 'open', 'closed', 'overdue'];
export const LIST_SOURCES = OPS_SOURCE_TABS.map((t) => t.key); // all, hub, ir, sort, tnl
export const LIST_PAGE_DEFAULT = 100;
export const LIST_PAGE_MAX = 500;

// Overdue uses the same rule as the Overdue count on the page (dueState). Only open issues can be overdue.
export function isOverdue(issue, now) {
  return !!now && dueState(issue, now).overdue;
}

export function matchesFilter(issue, filter, now) {
  if (filter === 'pick') return issue.issue_status === 'Raised';
  if (filter === 'open') return ['Picked', 'In Progress'].includes(issue.issue_status);
  if (filter === 'closed') return CLOSED_STATUSES.includes(issue.issue_status);
  if (filter === 'overdue') return isOverdue(issue, now);
  return true;
}

// Counts for every source tab: named to the viewer, to pick (Raised), and overdue.
export function listCounts(issues, now) {
  const out = {};
  for (const key of LIST_SOURCES) {
    const tab = (issues || []).filter((i) => inOpsSourceTab(i, key));
    out[key] = {
      named: tab.length,
      toPick: tab.filter((i) => i.issue_status === 'Raised').length,
      overdue: tab.filter((i) => isOverdue(i, now)).length,
    };
  }
  return out;
}

// The Raised issues, as small references for the header badge and the per-tab "new" counts.
export function raisedRefs(issues) {
  return (issues || [])
    .filter((i) => i.issue_status === 'Raised' && i.issue_id)
    .map((i) => ({ issue_id: String(i.issue_id), source: i.source || null, issue_status: 'Raised' }));
}

// One page of the list, after source, filter and search. total is the count after the filters (before paging).
export function listView(issues, { source = 'all', filter = 'all', q = '', sort = 'newest', size = LIST_PAGE_DEFAULT } = {}, now = new Date()) {
  const tab = LIST_SOURCES.includes(source) ? source : 'all';
  const f = LIST_FILTERS.includes(filter) ? filter : 'all';
  const term = String(q || '').trim().toLowerCase();
  const n = Math.min(LIST_PAGE_MAX, Math.max(0, Number.parseInt(size, 10) || LIST_PAGE_DEFAULT));
  const matching = (issues || []).filter((i) => {
    if (!inOpsSourceTab(i, tab)) return false;
    if (!matchesFilter(i, f, now)) return false;
    if (!term) return true;
    return [i.issue_id, i.consignment_id, i.merchant_name].some((v) => String(v || '').toLowerCase().includes(term));
  });
  const sorted = sortOpsIssues(matching, sort === 'oldest' ? 'oldest' : 'newest');
  return { total: matching.length, issues: sorted.slice(0, n) };
}
