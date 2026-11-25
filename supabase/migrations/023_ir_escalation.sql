-- IR Issue Escalation: KAM routing checkboxes (HUB / IR / Sort-TNL), IR mail subject and attachment,
-- and the IR sheet columns 11-16 (Drive Link, Status From KAM, Assigned IR Member, Feedback from IR,
-- Feedback from IR Lead, IR Status). IR Pick SLA and IR Resolve SLA are calculated in the app from
-- submitted_at, ir_picked_at and ir_resolved_at. Applied to the production project (kssypfibhlmoxucabhdu) with the Supabase connector.

alter table public.escalations
  add column if not exists route_hub boolean not null default true,
  add column if not exists route_ir boolean not null default false,
  add column if not exists route_sort_tnl boolean not null default false,
  add column if not exists mail_subject text,
  add column if not exists drive_link text,
  add column if not exists attachment_name text,
  add column if not exists ir_kam_status text,
  add column if not exists ir_assigned_member text,
  add column if not exists ir_feedback text,
  add column if not exists ir_lead_feedback text,
  add column if not exists ir_status text,
  add column if not exists ir_picked_at timestamptz,
  add column if not exists ir_resolved_at timestamptz,
  add column if not exists ir_sheet_row integer;

-- Existing rows all went to a hub response sheet, so route_hub stays true (the default) for them.

alter table public.escalations drop constraint if exists escalations_ir_status_check;
alter table public.escalations add constraint escalations_ir_status_check
  check (ir_status is null or ir_status in ('Open', 'Picked', 'In Progress', 'Resolved'));

create index if not exists escalations_route_ir_idx on public.escalations (route_ir) where route_ir;
