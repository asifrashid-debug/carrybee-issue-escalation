-- 009: Issue ID format CB-DD-MM-XXXX (XXXX = 4 random characters from A-Z and 2-9, no 0/O/1/I).
-- Uniqueness: a candidate is re-drawn if it already exists in public.escalations (up to 20 tries).
-- Existing IDs are NOT changed here. The rename of the six existing IDs is in 010_issue_id_rename_2026_11_14.sql.
-- Applied to the live database on 2026-11-14.

CREATE OR REPLACE FUNCTION public.next_issue_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_day  DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_tail TEXT;
  v_id   TEXT;
  v_try  INTEGER := 0;
BEGIN
  LOOP
    v_tail := '';
    FOR i IN 1..4 LOOP
      v_tail := v_tail || substr(v_chars, 1 + floor(random() * length(v_chars))::INTEGER, 1);
    END LOOP;
    v_id := 'CB-' || TO_CHAR(v_day, 'DD-MM') || '-' || v_tail;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.escalations WHERE issue_id = v_id);
    v_try := v_try + 1;
    IF v_try >= 20 THEN
      RAISE EXCEPTION 'Could not allocate a unique Issue ID after % tries', v_try;
    END IF;
  END LOOP;
  RETURN v_id;
END;
$$;
