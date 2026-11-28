-- MX API (MX CRM -> app): one row per external_id the MX CRM sends. Makes retries safe.
-- issue_id is empty while a request is being processed, and is set when the issue is saved.
-- Only the server (service role) reads or writes this table.
create table if not exists public.mx_api_requests (
  external_id   text primary key,
  request_hash  text not null,
  issue_id      text references public.escalations(issue_id),
  created_at    timestamptz not null default now()
);

create index if not exists mx_api_requests_issue_idx on public.mx_api_requests (issue_id);

alter table public.mx_api_requests enable row level security;
