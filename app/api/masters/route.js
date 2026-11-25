import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireUser, requireRole } from '../../../lib/session';
import { MasterInputError, BUILDERS, TABLES, entityKey } from '../../../lib/mastersWrite';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response; const session = auth.user;
  const sb = supabaseAdmin();
  // Hubs and categories are needed by the KAM and MX forms, so every signed-in role gets them.
  // The user list and app settings are admin-only, so they are not queried for other roles.
  const isAdmin = session.role === 'admin';
  const [hubRes, catRes, irCatRes, userRes, cfgRes] = await Promise.all([
    sb.from('hub_master').select('*').eq('is_active', true).order('hub_name'),
    sb.from('category_master').select('*').eq('is_active', true).order('category'),
    // IR category list, shown on the KAM form when only the IR box is ticked
    sb.from('ir_category_master').select('category, sub_category, issue_type, sla_days').eq('is_active', true).order('category'),
    isAdmin ? sb.from('users_roles').select('*').eq('is_active', true).order('email') : Promise.resolve({ data: [] }),
    isAdmin ? sb.from('app_config').select('*') : Promise.resolve({ data: [] }),
  ]);
  return NextResponse.json({ hubs: hubRes.data||[], categories: catRes.data||[], ir_categories: irCatRes.data||[], users: userRes.data||[], config: cfgRes.data||[] });
}

// Super admin adds one row to a master, then writes an audit entry. Body: { entity, data }.
// Writes only to the database. Nothing is written to the zone or hub response sheets.
export async function POST(request) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  const user = auth.user;
  const denied = requireRole(user, ['admin']); if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the form as JSON.' }, { status: 400 }); }
  const entity = body?.entity;
  const build = BUILDERS[entity];
  if (!build) return NextResponse.json({ error: 'Unknown form.' }, { status: 400 });

  let row;
  try { row = build(body.data || {}); }
  catch (e) {
    if (e instanceof MasterInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from(TABLES[entity]).insert(row);
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `That ${entity} already exists: ${entityKey(entity, row)}.` }, { status: 409 });
    }
    return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 });
  }

  const key = entityKey(entity, row);
  const { error: auditErr } = await sb.from('masters_audit_log').insert({
    entity, entity_key: key, action: 'add', actor_email: user.email, details: row,
  });
  if (auditErr) {
    // The row is saved. Report it so the admin can record it by hand.
    return NextResponse.json({ error: `Saved ${key}, but the audit entry failed: ${auditErr.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entity, entity_key: key });
}
