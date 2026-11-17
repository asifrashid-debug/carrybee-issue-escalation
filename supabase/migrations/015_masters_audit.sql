-- 015: audit log for Admin & Masters adds (hub, category, user, setting). Super admin only.
-- Separate from audit_log, which is tied to escalations (issue_id).
CREATE TABLE IF NOT EXISTS public.masters_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  entity       TEXT NOT NULL CHECK (entity IN ('hub','category','user','setting')),
  entity_key   TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('add')),
  actor_email  TEXT NOT NULL,
  details      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_masters_audit_created ON public.masters_audit_log (created_at DESC);

ALTER TABLE public.masters_audit_log ENABLE ROW LEVEL SECURITY;
