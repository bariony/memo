import { getDatabase } from '../config/database.js';
import { redis, connectRedis } from '../config/redis.js';
import { WhitelistEntry } from '../types/index.js';

export class WhitelistService {
  private readonly CACHE_TTL = 86400; // 24 hours in seconds

  async validateAccess(phone: string): Promise<{ authorized: boolean; reason?: string }> {
    // Check Redis cache first
    // redis client already imported
    const cached = await redis.get(`whitelist:${phone}`);
    if (cached === 'authorized') {
      return { authorized: true };
    }

    // Query database
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT status, permitted_until FROM whitelist WHERE phone_number = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return { authorized: false, reason: 'not_found' };
    }

    const entry = result.rows[0];
    if (entry.status === 'revoked') {
      return { authorized: false, reason: 'revoked' };
    }

    const permitDate = new Date(entry.permitted_until);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (permitDate < today) {
      return { authorized: false, reason: 'expired' };
    }

    // Cache authorized access
    await redis.setEx(`whitelist:${phone}`, this.CACHE_TTL, 'authorized');
    return { authorized: true };
  }

  async addUser(phone: string, permitted_until: Date): Promise<void> {
    const pool = getDatabase();

    // Create user if not exists
    await pool.query(
      'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
      [phone]
    );

    // Add to whitelist
    await pool.query(
      'INSERT INTO whitelist (phone_number, permitted_until, status) VALUES ($1, $2, $3) ON CONFLICT (phone_number) DO UPDATE SET permitted_until = EXCLUDED.permitted_until, status = EXCLUDED.status',
      [phone, permitted_until, 'active']
    );

    // Invalidate cache
    // redis client already imported
    await redis.del(`whitelist:${phone}`);
  }

  async revokeUser(phone: string): Promise<void> {
    const pool = getDatabase();
    await pool.query(
      'UPDATE whitelist SET status = $1, updated_at = NOW() WHERE phone_number = $2',
      ['revoked', phone]
    );

    // Invalidate cache
    // redis client already imported
    await redis.del(`whitelist:${phone}`);
  }

  async updateExpiration(phone: string, new_date: Date): Promise<void> {
    const pool = getDatabase();
    await pool.query(
      'UPDATE whitelist SET permitted_until = $1, updated_at = NOW() WHERE phone_number = $2',
      [new_date, phone]
    );

    // Invalidate cache
    // redis client already imported
    await redis.del(`whitelist:${phone}`);
  }

  async listUsers(): Promise<WhitelistEntry[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT phone_number, permitted_until, status, created_at, updated_at FROM whitelist ORDER BY created_at DESC'
    );
    return result.rows;
  }
}
