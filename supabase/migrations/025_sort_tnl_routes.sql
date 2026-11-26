-- Central Sort and TNL routes (replaces the single Sort/TNL flag from 023 for new issues).
-- route_sort_tnl stays for rows created before this change; new writes do not set it.
alter table public.escalations
  add column if not exists route_central_sort boolean not null default false,
  add column if not exists route_tnl boolean not null default false,
  add column if not exists central_sort_sheet_row integer,
  add column if not exists tnl_sheet_row integer;

create index if not exists escalations_route_central_sort_idx on public.escalations (route_central_sort) where route_central_sort;
create index if not exists escalations_route_tnl_idx on public.escalations (route_tnl) where route_tnl;
