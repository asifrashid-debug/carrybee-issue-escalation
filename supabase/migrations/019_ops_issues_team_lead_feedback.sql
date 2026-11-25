-- Ops Issues: Team Lead Feedback (sheet column M, free text, written by the Team Lead).
-- Read by the sync job from sheet column M into this column. Nullable: existing rows have no Team Lead feedback yet.
-- Not applied yet: apply only after the sheet change is approved and the code is deployed.
alter table public.ops_issues add column if not exists team_lead_feedback text;
