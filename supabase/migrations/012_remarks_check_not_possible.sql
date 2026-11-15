-- 2026-11-14: remarks are required for Invalid, Duplicate and Not possible.
-- Replaces the Dropped rule from 001 (Dropped was renamed to Not possible in 011).
BEGIN;
ALTER TABLE public.escalations DROP CONSTRAINT IF EXISTS chk_remarks_for_invalid_duplicate_dropped;
ALTER TABLE public.escalations ADD CONSTRAINT chk_remarks_for_invalid_duplicate_dropped
  CHECK (
    NOT (validation IN ('Invalid', 'Duplicate') OR ops_status = 'Not possible')
    OR NULLIF(TRIM(BOTH FROM COALESCE(remarks, '')), '') IS NOT NULL
  );
COMMIT;
