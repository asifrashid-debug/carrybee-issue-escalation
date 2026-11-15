-- 2026-11-14: align Ops Status and Validation with the sheet dropdowns; add completed_at for Issue Resolution SLA.
BEGIN;
UPDATE public.escalations SET ops_status = 'Not possible' WHERE ops_status = 'Dropped';
UPDATE public.escalations SET validation = 'No proper info' WHERE validation = 'Insufficient Info';
ALTER TABLE public.escalations DROP CONSTRAINT IF EXISTS escalations_ops_status_check;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_ops_status_check
  CHECK (ops_status IN ('Pending','In progress','Completed','Not possible','Critical issue'));
ALTER TABLE public.escalations DROP CONSTRAINT IF EXISTS escalations_validation_check;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_validation_check
  CHECK (validation IN ('Valid','Invalid','Duplicate','No proper info'));
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS completed_at timestamptz;
COMMIT;
