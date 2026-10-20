import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WhitelistService } from '../../src/services/whitelist.service';
import { getDatabase } from '../../src/config/database';

describe('WhitelistService', () => {
  let service: WhitelistService;
  let pool: any;

  beforeAll(async () => {
    pool = getDatabase();
    service = new WhitelistService();
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM whitelist WHERE phone_number LIKE $1', ['11%']);
      await pool.query('DELETE FROM users WHERE phone_number LIKE $1', ['11%']);
    } catch (e) {
      // Table might not exist yet
    }
    await pool.end();
  });

  it('should allow authorized user within expiration date', async () => {
    const phone = '11999999999';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await service.addUser(phone, tomorrow);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(true);
  });

  it('should block user with expired license', async () => {
    const phone = '11888888888';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await service.addUser(phone, yesterday);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('should block revoked users', async () => {
    const phone = '11777777777';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await service.addUser(phone, tomorrow);
    await service.revokeUser(phone);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('revoked');
  });
});
