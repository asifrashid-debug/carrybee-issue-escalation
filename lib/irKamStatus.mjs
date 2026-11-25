// KAM Status for IR issues (IR sheet column L, \"Status From KAM\"). Pure rules, tested in tests/irKamStatus.test.mjs.
// Who may set it: the KAM who raised the issue, that KAM's team lead (same team), and admin.

export const IR_KAM_STATUSES = ['Open', 'Waiting for IR', 'Resolved by KAM'];

// Teams are shared when the two users have at least one team in common (same rule as lib/roles.js).
function sharesTeam(user, other) {
  return !!other && (other.teams || []).some((t) => (user.teams || []).includes(t));
}

// esc: the escalation (esc.email = the raiser). users: active users_roles rows (email, role, teams).
export function canSetIrKamStatus(user, esc, users = []) {
  if (!user || !esc) return false;
  if (user.role === 'admin') return true;
  if (user.email && esc.email && user.email.toLowerCase() === String(esc.email).toLowerCase()) return true;
  if (user.role === 'team_lead') {
    const raiser = (users || []).find((u) => String(u.email || '').toLowerCase() === String(esc.email || '').toLowerCase());
    return sharesTeam(user, raiser);
  }
  return false;
}

// Returns an error message for an invalid value, or null.
export function kamStatusError(value) {
  if (!IR_KAM_STATUSES.includes(value)) return `KAM Status must be one of: ${IR_KAM_STATUSES.join(', ')}`;
  return null;
}
