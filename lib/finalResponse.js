// Final Response rule. Pure helpers, used by the sheet webhook and the tracker PATCH route.
// 1. Ops Status cannot become Completed unless Final Response has text.
// 2. Final Response cannot be cleared while Ops Status is Completed.
// Rows already Completed are not re-checked, so existing data is not affected.

export const COMPLETED = 'Completed';

export function hasText(v) {
  return String(v ?? '').trim() !== '';
}

// Returns { error } when moving ops status to nextOpsStatus must be refused, otherwise null.
export function completionBlock(cur, nextOpsStatus) {
  if (nextOpsStatus === COMPLETED && cur?.ops_status !== COMPLETED && !hasText(cur?.final_response)) {
    return { error: 'Final Response is required before Ops Status can be Completed. Enter it in the Final Response column first.' };
  }
  return null;
}

// Returns { error } when a sheet edit to final_response must be refused, otherwise null.
export function clearBlock(cur, field, newValue) {
  if (field === 'final_response' && !hasText(newValue) && cur?.ops_status === COMPLETED) {
    return { error: 'Final Response cannot be cleared while Ops Status is Completed.' };
  }
  return null;
}
