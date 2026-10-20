import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WhitelistService } from '../../src/services/whitelist.service';
import { getDatabase } from '../../src/config/database';

describe('Whitelist expiration boundary', () => {
  let service: WhitelistService;
  let pool: any;

  beforeAll(async () => {
    pool = getDatabase();
    service = new WhitelistService();
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM whitelist WHERE phone_number LIKE $1', ['111%']);
      await pool.query('DELETE FROM users WHERE phone_number LIKE $1', ['111%']);
    } catch (e) {
      // Table might not exist
    }
    await pool.end();
  });

  it('should allow access on the expiration date itself (up to 23:59:59)', async () => {
    const phone = '11111111111';
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    await service.addUser(phone, today);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(true);
  });

  it('should block access after expiration date (00:00:00 next day)', async () => {
    const phone = '11222222222';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await service.addUser(phone, yesterday);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('expired');
  });
});
