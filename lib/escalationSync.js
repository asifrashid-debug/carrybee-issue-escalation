// Sheet writes for an escalation to IR, Central Sort or TNL. Shared by the escalation POST (app/api/escalations)
// and the escalate action (app/api/escalations/[id]/escalate). Each write is logged in sync_log, and the sheet row
// number is saved on the escalation. Returns true when the write succeeded, false when it failed (logged, not thrown).
import { pushIrRow, irSheetId } from './irSheet';
import { pushRouteToSheet } from './sheets';
import { sortTnlSheetId } from './sortTnlRoutes.mjs';

// IR sheet write for an IR-routed escalation.
export async function queueIrSync(sb, esc) {
  const { data, error } = await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: esc.issue_id, spreadsheet_id: irSheetId(), status: 'queued', payload: { target: 'ir' } }).select().single();
  if (error) return false;
  try {
    const r = await pushIrRow(esc);
    await sb.from('sync_log').update({ status: 'success', updated_at: new Date().toISOString() }).eq('id', data.id);
    await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), ir_sheet_row: r.row }).eq('issue_id', esc.issue_id);
    return true;
  } catch (e) {
    await sb.from('sync_log').update({ status: 'failed', error_message: String(e.message || e), retries: 1, updated_at: new Date().toISOString() }).eq('id', data.id);
    return false;
  }
}

// Central Sort / TNL sheet write for a routed escalation, to that route's sheet.
const ROUTE_ROW_COL = { central_sort: 'central_sort_sheet_row', tnl: 'tnl_sheet_row' };
export async function queueRouteSync(sb, esc, route) {
  const { data, error } = await sb.from('sync_log').insert({ direction: 'db_to_sheet', issue_id: esc.issue_id, spreadsheet_id: sortTnlSheetId(route), status: 'queued', payload: { target: route } }).select().single();
  if (error) return false;
  try {
    const r = await pushRouteToSheet(esc, route);
    await sb.from('sync_log').update({ status: 'success', updated_at: new Date().toISOString() }).eq('id', data.id);
    await sb.from('escalations').update({ last_synced_at: new Date().toISOString(), [ROUTE_ROW_COL[route]]: r.row }).eq('issue_id', esc.issue_id);
    return true;
  } catch (e) {
    await sb.from('sync_log').update({ status: 'failed', error_message: String(e.message || e), retries: 1, updated_at: new Date().toISOString() }).eq('id', data.id);
    return false;
  }
}
