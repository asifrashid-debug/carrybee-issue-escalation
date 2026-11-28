import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser } from '../../../lib/session';
import { loadScope } from '../../../lib/visibility';
import { fetchAll } from '../../../lib/opsIssueSync';
import { trackerItems, viewerKamNames, KAM_BADGE_ROLES, trackerRowsFilter } from '../../../lib/trackerBadge.mjs';
import { routeListFilter } from '../../../lib/irEscalation.mjs';
export const dynamic = 'force-dynamic';

const COLS = 'issue_id,email,channel,kam_name,cm_owner_email,layer1_response,layer2_response,layer3_response';

// PostgREST pattern for a KAM name: words joined by *, quoted, with the reserved characters removed.
function namePattern(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[",()\\%_*]/g, ''));
  return `"*${words.filter(Boolean).join('*')}*"`;
}

// Tracker badge for the signed-in viewer: MX-channel issues they are named on that have a Layer 1/2/3 response.
// The database narrows the rows (own email, CM owner, KAM names). lib/trackerBadge.mjs applies the exact rule.
// Returns the items with their layer-response fingerprints. The browser decides which ones are still unseen.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const sb = supabaseAdmin();
  let items;
  try {
    const scope = await loadScope(sb, user);
    const viewer = scope?.user || user;
    const email = String(user.email || '').trim();
    const ors = [];
    if (email) {
      ors.push(`email.eq."${email.replace(/"/g, '')}"`);
      ors.push(`cm_owner_email.eq."${email.replace(/"/g, '')}"`);
    }
    if (KAM_BADGE_ROLES.includes(viewer.role)) {
      for (const n of viewerKamNames(viewer)) ors.push(`kam_name.ilike.${namePattern(n)}`);
    }
    if (!ors.length) {
      items = [];
    } else {
      const rows = await fetchAll(() => sb.from('escalations')
        .select(COLS)
        .eq('channel', 'MX')
        .eq('is_archived', false)
        .eq(routeListFilter(null).column, routeListFilter(null).value)
        .or(trackerRowsFilter(ors))
        .order('issue_id'));
      items = trackerItems(rows, viewer);
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.json({ items, viewer: user.email });
}
