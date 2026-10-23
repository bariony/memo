-- Free-form timestamped notes ("saí da empresa às 10h") the user wants saved
-- and retrieved later, e.g. for a timesheet.
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  text TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_phone_occurred ON notes(phone_number, occurred_at DESC);
