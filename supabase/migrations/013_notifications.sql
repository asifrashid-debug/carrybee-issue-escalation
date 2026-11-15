-- Notifications for hub responses (bell icon in the app header).
-- Written by the sheet webhook when a hub edits a layer response, status, validation or remarks.
CREATE TABLE IF NOT EXISTS notifications (
  id bigserial PRIMARY KEY,
  recipient_email text NOT NULL,
  issue_id text REFERENCES escalations(issue_id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'hub_response',
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_email, read_at, created_at DESC);
