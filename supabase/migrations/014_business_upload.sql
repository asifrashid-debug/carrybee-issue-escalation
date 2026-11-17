-- 014: KAM funnel upload (super admin). Replaces business_master from a CSV or a Google Sheet.
-- Full-list semantics: merchants missing from the upload are deactivated and their KAM is set to 'CM'.
-- upload log: one row per apply (and per failed apply). change log: one row per field changed in business_master.
CREATE TABLE IF NOT EXISTS public.business_upload_log (
  id              BIGSERIAL PRIMARY KEY,
  uploaded_by     TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('csv','sheet')),
  source_ref      TEXT,
  status          TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  rows_in_file    INTEGER NOT NULL DEFAULT 0,
  usable          INTEGER NOT NULL DEFAULT 0,
  duplicate_ids   INTEGER NOT NULL DEFAULT 0,
  no_kam          INTEGER NOT NULL DEFAULT 0,
  added           INTEGER NOT NULL DEFAULT 0,
  kam_changed     INTEGER NOT NULL DEFAULT 0,
  deactivated     INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_business_upload_created ON public.business_upload_log (created_at DESC);

CREATE TABLE IF NOT EXISTS public.business_master_changes (
  id           BIGSERIAL PRIMARY KEY,
  upload_id    BIGINT NOT NULL REFERENCES public.business_upload_log(id) ON DELETE CASCADE,
  business_id  TEXT NOT NULL,
  field_name   TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_changes_upload ON public.business_master_changes (upload_id);

ALTER TABLE public.business_upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_master_changes ENABLE ROW LEVEL SECURITY;
