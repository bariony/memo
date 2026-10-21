-- Tracks the "do you want to request access?" confirmation gate for
-- brand-new contacts, separate from name_requested_at/name (which now only
-- fire after confirmation). access_prompt_status is one of:
--   NULL        - gate not sent yet
--   'declined'  - said no; stop re-asking, don't notify the admin
--   'confirmed' - said yes; proceeds to the name question
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_prompt_sent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_prompt_status VARCHAR(20);
