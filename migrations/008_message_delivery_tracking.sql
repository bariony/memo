-- Tracks whether a reply actually reached the user over WhatsApp, not just
-- whether one was generated. evolutionService.sendMessage already computes
-- this (it retries once, then gives up and returns false), but previously
-- only console.error'd it - nothing queryable recorded a failed delivery,
-- so there was no way to answer "how many people got no reply in the last
-- N hours" without grepping raw logs.
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS delivered BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_message_logs_delivered ON message_logs(delivered, created_at DESC) WHERE delivered = false;
