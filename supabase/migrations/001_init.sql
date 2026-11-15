-- CarryBee Issue Escalation Tracker — initial schema (M1+M2)
-- DB is single source of truth. All timestamps stored UTC, displayed Asia/Dhaka.

-- ============ hub_master ============
CREATE TABLE IF NOT EXISTS public.hub_master (
  hub_name TEXT PRIMARY KEY,
  zone TEXT NOT NULL CHECK (zone IN ('ISD','OSD','CTG')),
  division TEXT NOT NULL,
  regional_lead TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ category_master ============
CREATE TABLE IF NOT EXISTS public.category_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'requester' CHECK (side IN ('requester','ops')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, sub_category, side)
);

-- ============ users_roles ============
CREATE TABLE IF NOT EXISTS public.users_roles (
  email TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('requester','hub_ops','regional_lead','admin','management')),
  zone TEXT CHECK (zone IN ('ISD','OSD','CTG')),
  region TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ escalations ============
CREATE TABLE IF NOT EXISTS public.escalations (
  issue_id TEXT PRIMARY KEY,
  -- Requester block
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email TEXT NOT NULL,
  consignment_id TEXT,
  merchant_name TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('KAM','MX')),
  zone TEXT NOT NULL CHECK (zone IN ('ISD','OSD','CTG')),
  concern_hub TEXT NOT NULL REFERENCES public.hub_master(hub_name),
  issue_status TEXT NOT NULL DEFAULT 'Open' CHECK (issue_status IN ('Open','Reopened','Closed')),
  issue_category TEXT NOT NULL,
  issue_sub_category TEXT NOT NULL,
  issue_details TEXT NOT NULL CHECK (char_length(issue_details) >= 20),
  kam_name TEXT,
  week TEXT NOT NULL,
  priority_scale TEXT NOT NULL CHECK (priority_scale IN ('P1','P2','P3','P4')),
  kam_feedback_status TEXT NOT NULL DEFAULT 'Not Shared' CHECK (kam_feedback_status IN ('Not Shared','Shared with Merchant','Merchant Confirmed','Merchant Disputed')),
  -- Ops block
  layer1_response TEXT,
  layer2_response TEXT,
  layer3_response TEXT,
  issue_pick_time TIMESTAMPTZ,
  ops_issue_status TEXT NOT NULL DEFAULT 'New' CHECK (ops_issue_status IN ('New','Picked','In Progress','On Hold','Resolved','Unresolved')),
  remarks TEXT,
  regional_lead TEXT,
  division TEXT,
  issue_response_datetime TIMESTAMPTZ,
  ops_status TEXT NOT NULL DEFAULT 'Pending' CHECK (ops_status IN ('Pending','In Progress','Completed','Dropped')),
  validation TEXT CHECK (validation IN ('Valid','Invalid','Duplicate','Insufficient Info')),
  ops_category TEXT,
  -- System / sync
  duplicate_of TEXT REFERENCES public.escalations(issue_id),
  row_version INTEGER NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMPTZ,
  sheet_spreadsheet_id TEXT,
  sheet_row_number INTEGER,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_consignment_or_merchant CHECK (NULLIF(TRIM(COALESCE(consignment_id,'')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(merchant_name,'')), '') IS NOT NULL),
  CONSTRAINT chk_remarks_for_unresolved CHECK (ops_issue_status <> 'Unresolved' OR NULLIF(TRIM(COALESCE(remarks,'')), '') IS NOT NULL),
  CONSTRAINT chk_remarks_for_invalid_duplicate_dropped CHECK (
    NOT (validation IN ('Invalid','Duplicate') OR ops_status = 'Dropped')
    OR NULLIF(TRIM(COALESCE(remarks,'')), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_esc_created ON public.escalations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esc_zone ON public.escalations (zone);
CREATE INDEX IF NOT EXISTS idx_esc_channel ON public.escalations (channel);
CREATE INDEX IF NOT EXISTS idx_esc_issue_status ON public.escalations (issue_status);
CREATE INDEX IF NOT EXISTS idx_esc_ops_status ON public.escalations (ops_issue_status);
CREATE INDEX IF NOT EXISTS idx_esc_ops_status2 ON public.escalations (ops_status);
CREATE INDEX IF NOT EXISTS idx_esc_priority ON public.escalations (priority_scale);
CREATE INDEX IF NOT EXISTS idx_esc_week ON public.escalations (week);
CREATE INDEX IF NOT EXISTS idx_esc_consignment ON public.escalations (consignment_id);
CREATE INDEX IF NOT EXISTS idx_esc_email ON public.escalations (email);
CREATE INDEX IF NOT EXISTS idx_esc_hub ON public.escalations (concern_hub);
CREATE INDEX IF NOT EXISTS idx_esc_validation ON public.escalations (validation);
CREATE INDEX IF NOT EXISTS idx_esc_archived ON public.escalations (is_archived);

-- ============ audit_log (append-only) ============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES public.escalations(issue_id) ON DELETE RESTRICT,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('form','tracker','sheet','system','admin','reconciliation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_issue ON public.audit_log (issue_id, created_at DESC);

-- ============ sync_log ============
CREATE TABLE IF NOT EXISTS public.sync_log (
  id BIGSERIAL PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('db_to_sheet','sheet_to_db','reconciliation')),
  issue_id TEXT,
  spreadsheet_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','sending','success','failed','dead_letter')),
  error_message TEXT,
  retries INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON public.sync_log (status, created_at);

-- ============ app_config ============
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ issue counter for ESC-YYYYMMDD-#### ============
CREATE TABLE IF NOT EXISTS public.issue_counter (
  day DATE PRIMARY KEY,
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_issue_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_day DATE := CURRENT_DATE;
  v_seq INTEGER;
  v_id TEXT;
BEGIN
  INSERT INTO public.issue_counter(day, seq) VALUES (v_day, 1)
  ON CONFLICT (day) DO UPDATE SET seq = public.issue_counter.seq + 1
  RETURNING seq INTO v_seq;
  v_id := 'ESC-' || TO_CHAR(v_day, 'YYYYMMDD') || '-' || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_id;
END;
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_esc_touch ON public.escalations;
CREATE TRIGGER trg_esc_touch BEFORE UPDATE ON public.escalations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_hub_touch ON public.hub_master;
CREATE TRIGGER trg_hub_touch BEFORE UPDATE ON public.hub_master
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_touch ON public.users_roles;
CREATE TRIGGER trg_user_touch BEFORE UPDATE ON public.users_roles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: pilot permissive (tighten with Google SSO + role policies in prod)
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_counter ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['escalations','hub_master','category_master','users_roles','audit_log','sync_log','app_config','issue_counter'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pilot_all ON public.%I', t);
    EXECUTE format('CREATE POLICY pilot_all ON public.%I FOR ALL USING (TRUE) WITH CHECK (TRUE)', t);
  END LOOP;
END $$;

-- Default config (all thresholds configurable, never hard-coded)
INSERT INTO public.app_config(key, value, description) VALUES
  ('sla', '{"pick_hours":4,"first_response_hours":24,"resolution_hours":72}'::jsonb, 'SLA thresholds in hours'),
  ('sheets', '{"ISD":"1fseMs55zUnwNXeS73yO6mRUk0Or4mipphg3clS2wzLU","OSD":"10gHOAFJYA8jL7ykbhYUiBu-YsixOnmzJ3v5UbwNpK7g","CTG":"1K-FQ3SvBtvO6_HFuiRGkpgzUF-nJF7N7vNxbMl2L7GQ"}'::jsonb, 'Zone -> spreadsheet ID'),
  ('validation', '{"consignment_id_regex":"^[A-Z0-9-]{6,30}$","reopen_days":7,"archive_days":90}'::jsonb, 'Consignment regex (TBC), reopen window, archive window'),
  ('divisions', '["Dhaka","Chattogram","Khulna","Rajshahi","Barishal","Sylhet","Rangpur","Mymensingh"]'::jsonb, 'Division master list')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;
