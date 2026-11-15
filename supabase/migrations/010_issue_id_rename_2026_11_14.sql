-- 010: One-time rename of existing Issue IDs to CB-DD-MM-XXXX (confirmed by user 2026-11-14).
-- Applied to the live database on 2026-11-14. Mapping: /home/user/backups/issue-id-rename-2026-11-14/id_map.json
-- Re-points every text reference in one transaction, and recreates the FKs with ON UPDATE CASCADE.
-- Sheet column A (Active!A2) was updated in the three zone sheets in the same session.

BEGIN;

CREATE TEMP TABLE id_map (old_id TEXT PRIMARY KEY, new_id TEXT UNIQUE NOT NULL) ON COMMIT DROP;
INSERT INTO id_map (old_id, new_id) VALUES
  ('ESC-20261114-0001', 'CB-14-11-2G4U'),
  ('ESC-20261114-0002', 'CB-14-11-B5TA'),
  ('ESC-20261114-0003', 'CB-14-11-P2YL'),
  ('ESC-20261114-0004', 'CB-14-11-MTUP'),
  ('ESC-20261114-0005', 'CB-14-11-7HM5'),
  ('ESC-20261114-0006', 'CB-14-11-AYDZ');

ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_issue_id_fkey;
ALTER TABLE public.followups DROP CONSTRAINT followups_issue_id_fkey;
ALTER TABLE public.kam_feedback_justifications DROP CONSTRAINT kam_feedback_justifications_issue_id_fkey;
ALTER TABLE public.pick_justifications DROP CONSTRAINT pick_justifications_issue_id_fkey;
ALTER TABLE public.escalations DROP CONSTRAINT escalations_duplicate_of_fkey;

UPDATE public.escalations e SET issue_id = m.new_id FROM id_map m WHERE e.issue_id = m.old_id;
UPDATE public.escalations e SET duplicate_of = m.new_id FROM id_map m WHERE e.duplicate_of = m.old_id;
UPDATE public.audit_log a SET issue_id = m.new_id FROM id_map m WHERE a.issue_id = m.old_id;
UPDATE public.followups f SET issue_id = m.new_id FROM id_map m WHERE f.issue_id = m.old_id;
UPDATE public.kam_feedback_justifications k SET issue_id = m.new_id FROM id_map m WHERE k.issue_id = m.old_id;
UPDATE public.pick_justifications p SET issue_id = m.new_id FROM id_map m WHERE p.issue_id = m.old_id;
UPDATE public.sync_log s SET issue_id = m.new_id FROM id_map m WHERE s.issue_id = m.old_id;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES public.escalations(issue_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.followups ADD CONSTRAINT followups_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES public.escalations(issue_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.kam_feedback_justifications ADD CONSTRAINT kam_feedback_justifications_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES public.escalations(issue_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.pick_justifications ADD CONSTRAINT pick_justifications_issue_id_fkey
  FOREIGN KEY (issue_id) REFERENCES public.escalations(issue_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_duplicate_of_fkey
  FOREIGN KEY (duplicate_of) REFERENCES public.escalations(issue_id) ON UPDATE CASCADE;

COMMIT;
