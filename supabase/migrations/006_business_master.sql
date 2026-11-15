-- 006: business master for the MX form. A business ID or name resolves to the business name and its KAM.
-- Loaded from the business list once it is supplied (see scripts/load-business.js). Empty = every MX issue gets KAM 'CM'.
CREATE TABLE IF NOT EXISTS public.business_master (
  business_id   TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  kam_name      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_name_lower ON public.business_master (lower(business_name));
ALTER TABLE public.business_master ENABLE ROW LEVEL SECURITY;
