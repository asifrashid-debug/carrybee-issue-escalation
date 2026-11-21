-- Final Response: the hub's final answer on an issue, entered in the hub response sheet (column T, after Layer 3).
-- Ops Status cannot be Completed without it (see lib/finalResponse.js). Additive only: nullable text.
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS final_response text;
