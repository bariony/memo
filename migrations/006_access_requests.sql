CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'denied')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status, created_at DESC);

-- Only one open request per phone number at a time, so repeated messages
-- from someone already waiting don't ping the admin again on every message.
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending_phone
  ON access_requests(phone_number) WHERE status = 'pending';
