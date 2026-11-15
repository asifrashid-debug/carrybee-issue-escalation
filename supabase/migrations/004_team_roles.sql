-- Team login roles (from "Team Members FOR ISSUES ESCALATION LOGIN" sheet).
-- Auth is Google SSO (no EPID passwords). Accounts are keyed by email.
ALTER TABLE public.users_roles ADD COLUMN IF NOT EXISTS teams TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.users_roles DROP CONSTRAINT IF EXISTS users_roles_role_check;
ALTER TABLE public.users_roles ADD CONSTRAINT users_roles_role_check
  CHECK (role IN ('requester','hub_ops','regional_lead','admin','management','team_lead','cm_lead','cm_member','mx'));
