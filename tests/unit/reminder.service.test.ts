import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ReminderService } from '../../src/services/reminder.service';
import { getDatabase } from '../../src/config/database';

describe('ReminderService', () => {
  let service: ReminderService;
  let pool: any;
  const testPhone = '11999999999';

  beforeAll(async () => {
    pool = getDatabase();
    service = new ReminderService();
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM reminders WHERE phone_number = $1', [testPhone]);
      await pool.query('DELETE FROM users WHERE phone_number = $1', [testPhone]);
    } catch (e) {
      // Table might not exist yet
    }
    await pool.end();
  });

  it('should have scheduleReminder method', () => {
    expect(typeof service.scheduleReminder).toBe('function');
  });

  it('should have getRemindersByUser method', () => {
    expect(typeof service.getRemindersByUser).toBe('function');
  });

  it('should have initializeWorker method', () => {
    expect(typeof service.initializeWorker).toBe('function');
  });
});
