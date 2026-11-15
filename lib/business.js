// Business lookup for the MX form.
// The merchant box accepts a business ID or a business name. A match returns the business name and its KAM.
// No match (or no KAM on the matched business) means the KAM is 'CM'.
// The server runs the same lookup when the issue is saved, so the client cannot set the KAM.
export const CM_KAM = 'CM';

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export async function lookupBusiness(sb, input) {
  const q = String(input || '').trim().replace(/\s+/g, ' ');
  if (!q) return { input_type: 'none', found: false, business_id: null, business_name: null, kam_name: CM_KAM };
  // 1) exact business ID
  const byId = await sb.from('business_master').select('business_id, business_name, kam_name')
    .eq('is_active', true).eq('business_id', q).maybeSingle();
  if (byId.error) throw new Error(byId.error.message);
  if (byId.data) return pack('id', byId.data);
  // 2) exact business name (case-insensitive)
  const byName = await sb.from('business_master').select('business_id, business_name, kam_name')
    .eq('is_active', true).ilike('business_name', escapeLike(q)).limit(2);
  if (byName.error) throw new Error(byName.error.message);
  if (byName.data?.length === 1) return pack('name', byName.data[0]);
  return { input_type: byName.data?.length > 1 ? 'ambiguous' : 'none', found: false, business_id: null, business_name: null, kam_name: CM_KAM };
}

function pack(input_type, row) {
  return {
    input_type,
    found: true,
    business_id: row.business_id,
    business_name: row.business_name,
    kam_name: (row.kam_name || '').trim() || CM_KAM,
  };
}
