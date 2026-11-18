-- CM owner for CM-assigned MX issues (round-robin, set at raise by app/api/escalations/route.js).
-- Additive only: a nullable column and an index. Existing rows stay NULL.
-- Checked 18 Nov 2026: no CM-assigned issues exist yet, so there is nothing to backfill.
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS cm_owner_email text;
CREATE INDEX IF NOT EXISTS escalations_cm_owner_idx ON escalations (cm_owner_email) WHERE cm_owner_email IS NOT NULL;
