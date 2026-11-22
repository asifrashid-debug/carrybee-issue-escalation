-- Ops Issues: HUB Name (chosen from the zone's active hubs in hub_master, dropdown in the sheet).
-- Written by the sync job from sheet column G (HUB Name). Nullable: existing rows have no hub until it is picked.
alter table public.ops_issues add column if not exists hub_name text;
