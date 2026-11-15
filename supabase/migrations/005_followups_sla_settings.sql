-- 005: follow-ups (KAM + CM 1st/2nd/3rd) and SLA settings.
-- Saved views are browser-local by spec, so no table for them.

CREATE TABLE IF NOT EXISTS public.followups (
  id BIGSERIAL PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES public.escalations(issue_id) ON DELETE RESTRICT,
  level SMALLINT NOT NULL CHECK (level BETWEEN 0 AND 3),  -- 0 = KAM followup, 1..3 = CM followups
  actor_email TEXT NOT NULL,
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  UNIQUE (issue_id, level)
);
CREATE INDEX IF NOT EXISTS idx_followups_issue ON public.followups (issue_id);
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sla_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
INSERT INTO public.sla_settings (key, value) VALUES
  ('comment_hours', '2'),
  ('kam_followup_hours', '2.5'),
  ('cm_first_followup_hours', '2.5'),
  ('cm_gap_hours', '[2, 2]')
ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;
