CREATE INDEX IF NOT EXISTS idx_expenses_phone ON expenses(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_phone ON reminders(phone_number);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders(sent);
CREATE INDEX IF NOT EXISTS idx_whitelist_status ON whitelist(status);
CREATE INDEX IF NOT EXISTS idx_whitelist_permitted ON whitelist(permitted_until);
