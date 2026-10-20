CREATE TABLE IF NOT EXISTS users (
  phone_number VARCHAR(20) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whitelist (
  phone_number VARCHAR(20) PRIMARY KEY REFERENCES users(phone_number) ON DELETE CASCADE,
  permitted_until DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  type VARCHAR(20) CHECK (type IN ('one_time', 'recurring')) DEFAULT 'one_time',
  scheduled_for TIMESTAMP NOT NULL,
  recurrence_rule TEXT,
  message TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20),
  message_text TEXT,
  error TEXT,
  attempts INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
