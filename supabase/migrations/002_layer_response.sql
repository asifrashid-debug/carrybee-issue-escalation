-- 002: replace Ops comments with 3-layer response cells (HUB Incharge -> Cluster Lead -> Regional Lead)
-- Each layer cell is free text. SLA: 2h per layer, cumulative (L1 red @2h, L2 red @4h, L3 red @6h).

ALTER TABLE public.escalations
  ADD COLUMN IF NOT EXISTS layer1_response TEXT,   -- Layer 1: HUB Incharge
  ADD COLUMN IF NOT EXISTS layer2_response TEXT,   -- Layer 2: Cluster Lead
  ADD COLUMN IF NOT EXISTS layer3_response TEXT;   -- Layer 3: Regional Lead

-- Keep any existing hub replies: fold old Comments 1 + 2 into Layer 1 (they were hub-side replies)
UPDATE public.escalations
SET layer1_response = NULLIF(TRIM(CONCAT_WS(E'\n', comments_1, comments_2)), '')
WHERE layer1_response IS NULL
  AND (NULLIF(TRIM(COALESCE(comments_1,'')),'') IS NOT NULL OR NULLIF(TRIM(COALESCE(comments_2,'')),'') IS NOT NULL);

ALTER TABLE public.escalations DROP COLUMN IF EXISTS comments_1;
ALTER TABLE public.escalations DROP COLUMN IF EXISTS comments_2;

INSERT INTO public.app_config(key, value, description) VALUES
  ('response_layers', '{"hours_per_layer":2,"mode":"cumulative","layers":[{"n":1,"label":"HUB Incharge"},{"n":2,"label":"Cluster Lead"},{"n":3,"label":"Regional Lead"}]}'::jsonb, 'Per-layer response SLA (hours) and layer names')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;
