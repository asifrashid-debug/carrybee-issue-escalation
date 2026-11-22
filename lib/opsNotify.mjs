// Bell notices for Ops-KAM issues. Pure helpers; the sync job does the writes (lib/opsIssueSync.js).
//
// Rule: a KAM is told when a NEW Ops Issue is raised for them (first sync that sees the row).
// Recipients are the same people who can see the issue in the Ops-KAM tab: active users, not admin,
// whose display name or kam_aliases match the issue's KAM Name (see visibleOpsIssues in lib/opsIssues.mjs).
// Rows with no KAM Name (unmatched merchant, conflicting KAM) get no notice.

import { kamNames } from './roles.js';
import { normName } from './opsIssues.mjs';

export const OPS_NOTICE_KIND = 'ops_issue_raised';

// Active non-admin users who can see issues with this KAM Name.
export function opsNoticeRecipients(kamName, users = []) {
  const key = normName(kamName);
  if (!key) return [];
  const out = new Set();
  for (const u of users) {
    if (!u?.email || u.is_active === false) continue;
    if (u.role === 'admin') continue;
    if (kamNames(u).includes(key)) out.add(String(u.email).toLowerCase());
  }
  return [...out];
}

// The bell text for one new issue. Title and body are plain text; issue_id stays null on the row
// (notifications.issue_id points at escalations, and Ops Issue IDs are not in that table).
export function opsNotice(issue) {
  const id = issue?.issue_id || '';
  const what = issue?.issue_category || 'Ops issue';
  const merchant = issue?.merchant_name || '';
  return {
    title: `${id}: new Ops issue for you`,
    body: merchant ? `${what} · ${merchant}` : what,
  };
}

// Rows for the bell, one per recipient per new issue. Empty when the issue has no KAM Name.
export function opsNoticeRows(issues = [], users = []) {
  const rows = [];
  for (const issue of issues) {
    const emails = opsNoticeRecipients(issue?.kam_name, users);
    if (!emails.length) continue;
    const notice = opsNotice(issue);
    for (const email of emails) {
      rows.push({ recipient_email: email, issue_id: null, kind: OPS_NOTICE_KIND, title: notice.title, body: notice.body });
    }
  }
  return rows;
}
