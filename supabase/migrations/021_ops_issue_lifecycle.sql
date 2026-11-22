-- Ops Issues lifecycle: Raised -> Picked -> In Progress -> Resolved | Not Resolved, plus KAM validation.
-- Additive only: nullable columns on public.ops_issues (table created by 017). No backfill needed: the table had 0 rows when this was written.
-- NOT APPLIED. Apply only after approval. Deploy order: apply this migration before the code that reads these columns.
-- Status values are enforced in the app (lib/opsLifecycle.mjs), not by a CHECK. A CHECK would make one typed sheet value fail the whole sync.

alter table public.ops_issues
  add column if not exists raised_at timestamptz,        -- set when the sync first sees the row (status Raised)
  add column if not exists pick_due_at timestamptz,      -- raised_at + 30 minutes
  add column if not exists picked_at timestamptz,
  add column if not exists picked_by text,               -- KAM email
  add column if not exists in_progress_at timestamptz,
  add column if not exists resolve_due_at timestamptz,   -- raised_at + 24 hours
  add column if not exists closed_at timestamptz,        -- Resolved or Not Resolved
  add column if not exists closed_by text,
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by text;

-- Open issues by due date, for the overdue view.
create index if not exists ops_issues_open_pick_due_idx on public.ops_issues (pick_due_at) where picked_at is null;
create index if not exists ops_issues_resolve_due_idx on public.ops_issues (resolve_due_at) where closed_at is null;
