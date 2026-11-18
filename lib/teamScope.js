// Team Performance: who sees what. Pure module, used by /api/analytics?view=teams and tests.
//   admin               : every team, full detail.
//   team_lead, cm_lead  : only their own team(s). Numbers count only issues raised by members of those teams.
//   everyone else       : only their own figures, in their own team(s). Other members' issues and names are left out.
import { computeAnalytics } from './analytics.js';

export function teamPerformanceView({ session, users = [], escalations = [], hubs = [], categories = [], now = new Date() }) {
  const role = session?.role;

  if (role === 'admin') {
    return computeAnalytics({ escalations, users, hubs, categories, now });
  }

  if (role === 'team_lead' || role === 'cm_lead') {
    const mine = new Set(session.teams || []);
    const memberEmails = new Set(
      users.filter((u) => (u.teams || []).some((t) => mine.has(t))).map((u) => u.email)
    );
    const r = computeAnalytics({
      escalations: escalations.filter((e) => memberEmails.has(e.email)),
      users,
      hubs,
      categories,
      now,
    });
    return { ...r, teams: r.teams.filter((t) => mine.has(t.team)), unmappedRaisers: 0 };
  }

  // Member view: only this person's own issues, and only this person as a row.
  const self = users.filter((u) => u.email === session?.email);
  const own = escalations.filter((e) => e.email === session?.email);
  return computeAnalytics({ escalations: own, users: self, hubs: [], categories, now });
}
