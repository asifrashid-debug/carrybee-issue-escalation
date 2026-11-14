// Seed 3 demo escalations (one per zone) + push to sheets if creds present.
// Usage: node scripts/seed-demo.js  (requires .env.local with Supabase + Sheets)
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const demos = [
    { email: 'kam.user@carrybee.com', consignment_id: 'CB-100001', merchant_name: 'Demo Merchant ISD', channel: 'KAM', zone: 'ISD', concern_hub: 'Dhaka Central Hub', issue_category: 'Delivery Delay', issue_sub_category: 'Late Delivery', issue_details: 'Consignment delayed 2 days at Dhaka Central Hub, merchant escalated twice.', kam_name: 'Demo KAM', priority_scale: 'P2' },
    { email: 'mx.user@carrybee.com', consignment_id: 'CB-200001', merchant_name: 'Demo Merchant OSD', channel: 'MX', zone: 'OSD', concern_hub: 'Khulna Hub', issue_category: 'Pickup Issue', issue_sub_category: 'Pickup Missed', issue_details: 'Pickup missed twice in Khulna, merchant waiting for collection confirmation.', kam_name: 'N/A — MX Direct', priority_scale: 'P3' },
    { email: 'kam.user@carrybee.com', consignment_id: 'CB-300001', merchant_name: 'Demo Merchant CTG', channel: 'KAM', zone: 'CTG', concern_hub: 'Chattogram Central Hub', issue_category: 'Tracking Issue', issue_sub_category: 'Tracking Not Updated', issue_details: 'Tracking not updated for 48 hours in Chattogram, customer cannot see status.', kam_name: 'Demo KAM', priority_scale: 'P1' }
  ];
  for (const d of demos) {
    const { data: id } = await sb.rpc('next_issue_id');
    const { data: hub } = await sb.from('hub_master').select('*').eq('hub_name', d.concern_hub).single();
    const now = new Date().toISOString();
    const row = { ...d, issue_id: id, submitted_at: now, week: '2026-W46', issue_status: 'Open', kam_feedback_status: 'Not Shared', ops_issue_status: 'New', ops_status: 'Pending', regional_lead: hub.regional_lead, division: hub.division };
    const { data, error } = await sb.from('escalations').insert(row).select().single();
    console.log(error ? `FAIL ${d.zone}: ${error.message}` : `OK ${data.issue_id} (${d.zone})`);
  }
}
main();
