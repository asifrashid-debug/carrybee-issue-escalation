// Loads the rows and masters the daily report needs. Shared by the 8 PM cron and the admin draft/send routes.
const COLS = 'issue_id,cm_assigned,submitted_at,email,channel,zone,concern_hub,division,regional_lead,issue_status,issue_category,issue_sub_category,priority_scale,issue_pick_time,issue_response_datetime,ops_issue_status,ops_status,is_archived';

export async function loadReportData(sb) {
  const escalations = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('escalations').select(COLS).order('submitted_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(`escalations: ${error.message}`);
    escalations.push(...data);
    if (data.length < 1000) break;
  }
  const [usersRes, hubsRes, catsRes] = await Promise.all([
    sb.from('users_roles').select('email, display_name, role, teams').eq('is_active', true),
    sb.from('hub_master').select('hub_name, zone, division, regional_lead, cluster_lead').eq('is_active', true),
    sb.from('category_master').select('category, sub_category, side, is_active, sla_isd, sla_osd, sla_ctg').eq('side', 'requester').eq('is_active', true),
  ]);
  for (const r of [usersRes, hubsRes, catsRes]) if (r.error) throw new Error(r.error.message);
  return { escalations, users: usersRes.data, hubs: hubsRes.data, categories: catsRes.data };
}
