-- Escalate to IR, Central Sort or TNL from a tracker card (approved 14 Nov 2026).
-- Adds who escalated an issue, to which team, and when. Nullable: existing rows are not escalated.
-- No index is added here; an index needs its own approval.

alter table public.escalations
  add column if not exists escalated_to text
    check (escalated_to in ('ir', 'central_sort', 'tnl')),
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by text;
