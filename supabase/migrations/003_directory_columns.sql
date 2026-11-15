-- 003: columns for the HUB Directory and Issue Category list (data loaded by scripts/load-directory.js)
ALTER TABLE public.hub_master
  ADD COLUMN IF NOT EXISTS cluster_lead  TEXT,
  ADD COLUMN IF NOT EXISTS outbound_poc  TEXT,
  ADD COLUMN IF NOT EXISTS pickup_poc    TEXT,
  ADD COLUMN IF NOT EXISTS inbound_poc   TEXT;

ALTER TABLE public.category_master
  ADD COLUMN IF NOT EXISTS issue_type TEXT,   -- Critical / Regular / Urgent
  ADD COLUMN IF NOT EXISTS sla_isd    INT,
  ADD COLUMN IF NOT EXISTS sla_osd    INT,
  ADD COLUMN IF NOT EXISTS sla_ctg    INT;
