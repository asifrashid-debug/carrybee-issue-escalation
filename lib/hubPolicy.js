// Hub updates (layer responses, pick, ops status) come from the hub response sheet.
// Hub users (hub_ops) therefore have no write access to these in the tracker.
// The role is looked up server-side from users_roles; the client-supplied role is not trusted.
export const HUB_BLOCKED_MESSAGE = 'Hub updates come from the hub response sheet. Hub users cannot pick, respond or change ops status in the tracker.';

export const LAYER_BLOCKED_MESSAGE = 'Hub layer responses come from the hub response sheet and cannot be entered in the tracker.';

export async function actorRole(sb, email) {
  if (!email) return null;
  const { data } = await sb.from('users_roles').select('role').eq('email', email).eq('is_active', true).maybeSingle();
  return data?.role || null;
}

export function isHubRole(role) {
  return role === 'hub_ops';
}
