CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  intent VARCHAR(50),
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  tokens_consumed INT NOT NULL,
  context VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_phone_date ON message_logs(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_phone_date ON token_usage(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_date ON message_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(created_at DESC);
