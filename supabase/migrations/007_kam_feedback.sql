-- 007: KAM feedback workflow.
-- Feedback starts as Pending (auto). Owner gives Resolved / Not Resolved / Improper Remarks within 24h of raising.
-- If missed: justification (max 2), each one reopens a 24h window. If the window after the 2nd justification is missed,
-- the issue is a Feedback failure, raised to the Team Lead (feedback_escalated_at).
ALTER TABLE public.escalations DROP CONSTRAINT IF EXISTS escalations_kam_feedback_status_check;
UPDATE public.escalations SET kam_feedback_status = CASE kam_feedback_status
  WHEN 'Merchant Confirmed' THEN 'Resolved'
  WHEN 'Merchant Disputed' THEN 'Not Resolved'
  ELSE 'Pending' END;
ALTER TABLE public.escalations ALTER COLUMN kam_feedback_status SET DEFAULT 'Pending';
ALTER TABLE public.escalations ADD CONSTRAINT escalations_kam_feedback_status_check
  CHECK (kam_feedback_status IN ('Pending','Resolved','Not Resolved','Improper Remarks'));
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS feedback_due_at TIMESTAMPTZ;
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS feedback_justifications SMALLINT NOT NULL DEFAULT 0
  CHECK (feedback_justifications BETWEEN 0 AND 2);
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS feedback_given_at TIMESTAMPTZ;
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS feedback_escalated_at TIMESTAMPTZ;
UPDATE public.escalations SET feedback_due_at = submitted_at + INTERVAL '24 hours' WHERE feedback_due_at IS NULL;
ALTER TABLE public.escalations ALTER COLUMN feedback_due_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.kam_feedback_justifications (
  id BIGSERIAL PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES public.escalations(issue_id) ON DELETE RESTRICT,
  round SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 2),
  justification TEXT NOT NULL CHECK (char_length(justification) >= 20),
  submitted_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, round)
);
ALTER TABLE public.kam_feedback_justifications ENABLE ROW LEVEL SECURITY;
