-- Stores the assistant's own reply alongside the user's message so we can
-- rebuild real short-term conversation history for Claude. Previously only
-- the user's message was logged, so every Claude call was a stateless
-- one-shot with zero memory of what was just said.
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS response_text TEXT;
