-- Ops Issues tab: separate table (not escalations). Applied to project kssypfibhlmoxucabhdu as "ops_issues_table".
create table if not exists public.ops_issues (
  issue_id text primary key default next_issue_id(),
  consignment_id text,
  merchant_name text,
  issue_category text,
  issue_sub_category text,
  hub_feedback text,
  kam_name text,
  issue_status text,
  validation text,
  kam_feedback text,
  sheet_spreadsheet_id text,
  sheet_row_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same as escalations: RLS on, no policies. The app uses the service role.
alter table public.ops_issues enable row level security;
