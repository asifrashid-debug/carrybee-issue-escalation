// Priority comes from the sub category's ISSUE TYPE in the Issue Category list (category_master.issue_type).
// Critical -> P1 (highest), Urgent -> P2, Regular -> P3. Requesters and admins do not choose it.
// Pure module: safe to import in both the browser form and the API routes.
export const PRIORITY_BY_ISSUE_TYPE = { Critical: 'P1', Urgent: 'P2', Regular: 'P3' };

export function priorityForIssueType(issueType) {
  return PRIORITY_BY_ISSUE_TYPE[issueType] || null;
}
