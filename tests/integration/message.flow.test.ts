import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MessageService } from '../../src/services/message.service';
import { getDatabase } from '../../src/config/database';

describe('Message Processing Flow', () => {
  let service: MessageService;
  let pool: any;
  const testPhone = '11999999999';

  beforeAll(async () => {
    pool = getDatabase();
    service = new MessageService();

    // Setup test user in whitelist
    try {
      await pool.query(
        'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
        [testPhone]
      );
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await pool.query(
        'INSERT INTO whitelist (phone_number, permitted_until, status) VALUES ($1, $2, $3) ON CONFLICT (phone_number) DO UPDATE SET permitted_until = EXCLUDED.permitted_until',
        [testPhone, tomorrow, 'active']
      );
    } catch (e) {
      console.error('Setup error:', e);
    }
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM expenses WHERE phone_number = $1', [testPhone]);
      await pool.query('DELETE FROM reminders WHERE phone_number = $1', [testPhone]);
      await pool.query('DELETE FROM whitelist WHERE phone_number = $1', [testPhone]);
      await pool.query('DELETE FROM users WHERE phone_number = $1', [testPhone]);
    } catch (e) {
      // Tables might not exist yet
    }
    await pool.end();
  });

  it('should have processMessage method', () => {
    expect(typeof service.processMessage).toBe('function');
  });
});
