-- CM pick SLA for MX issues assigned to CM (KAM = 'CM').
-- Pick deadline from raise: P1 10 min, P2 15 min, P3 20 min (P4 treated as 20 min).
-- Any late or missed pick needs a justification, asked twice; no justification in its 24h window -> Feedback failure for the CM lead.

ALTER TABLE public.escalations
  ADD COLUMN IF NOT EXISTS cm_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pick_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pick_missed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pick_justifications SMALLINT NOT NULL DEFAULT 0 CHECK (pick_justifications BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS pick_justify_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pick_escalated_at TIMESTAMPTZ;

-- Flag CM-assigned MX issues. Picks change kam_name, so also check the audit trail for an earlier 'CM'.
UPDATE public.escalations e
SET cm_assigned = TRUE
WHERE e.channel = 'MX'
  AND (upper(btrim(e.kam_name)) = 'CM'
       OR EXISTS (SELECT 1 FROM public.audit_log a
                  WHERE a.issue_id = e.issue_id AND a.field_name = 'kam_name' AND upper(btrim(a.old_value)) = 'CM'));

UPDATE public.escalations
SET pick_due_at = submitted_at + (CASE priority_scale WHEN 'P1' THEN 10 WHEN 'P2' THEN 15 ELSE 20 END) * INTERVAL '1 minute'
WHERE cm_assigned AND pick_due_at IS NULL;

UPDATE public.escalations
SET pick_missed = COALESCE(issue_pick_time > pick_due_at, FALSE),
    pick_justify_due_at = pick_due_at + INTERVAL '24 hours'
WHERE cm_assigned;

CREATE TABLE IF NOT EXISTS public.pick_justifications (
  id BIGSERIAL PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES public.escalations(issue_id) ON DELETE RESTRICT,
  round SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 2),
  justification TEXT NOT NULL CHECK (char_length(justification) >= 20),
  submitted_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, round)
);
ALTER TABLE public.pick_justifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_escalations_pick_failure
  ON public.escalations (pick_justify_due_at) WHERE cm_assigned AND pick_justifications < 2;
