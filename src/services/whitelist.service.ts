import { getDatabase } from '../config/database.js';
import { redis, connectRedis } from '../config/redis.js';
import { WhitelistEntry } from '../types/index.js';
import { normalizePhone } from '../utils/validator.js';
import { scheduleRenewalReminders } from '../workers/messaging.worker.js';

export class WhitelistService {
  private readonly CACHE_TTL = 86400; // 24 hours in seconds

  async validateAccess(
    phoneRaw: string
  ): Promise<{ authorized: boolean; reason?: string; permitted_until?: string }> {
    const phone = normalizePhone(phoneRaw);

    // Check Redis cache first
    // redis client already imported
    const cached = await redis.get(`whitelist:${phone}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.toString());
        return { authorized: true, permitted_until: parsed.permitted_until };
      } catch {
        // Legacy cache value ('authorized' string) - fall through to DB query
      }
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
    await redis.setEx(
      `whitelist:${phone}`,
      this.CACHE_TTL,
      JSON.stringify({ permitted_until: entry.permitted_until })
    );
    return { authorized: true, permitted_until: entry.permitted_until };
  }

  async addUser(phoneRaw: string, permitted_until: Date, userName?: string): Promise<void> {
    const phone = normalizePhone(phoneRaw);
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

    // Renewal nudges 7/2/1 days before expiry - previously this
    // infrastructure existed (BullMQ jobs, message templates) but nothing
    // ever called it, so access would just silently lapse with no warning.
    try {
      let name = userName;
      if (!name) {
        const userRow = await pool.query('SELECT name FROM users WHERE phone_number = $1', [phone]);
        name = userRow.rows[0]?.name ?? undefined;
      }
      await scheduleRenewalReminders(phone, permitted_until, name);
    } catch (err) {
      console.error('Failed to schedule renewal reminders:', err);
    }
  }

  async revokeUser(phoneRaw: string): Promise<void> {
    const phone = normalizePhone(phoneRaw);
    const pool = getDatabase();
    await pool.query(
      'UPDATE whitelist SET status = $1, updated_at = NOW() WHERE phone_number = $2',
      ['revoked', phone]
    );

    // Invalidate cache
    // redis client already imported
    await redis.del(`whitelist:${phone}`);
  }

  async updateExpiration(phoneRaw: string, new_date: Date): Promise<void> {
    const phone = normalizePhone(phoneRaw);
    const pool = getDatabase();
    await pool.query(
      'UPDATE whitelist SET permitted_until = $1, updated_at = NOW() WHERE phone_number = $2',
      [new_date, phone]
    );

    // Invalidate cache
    // redis client already imported
    await redis.del(`whitelist:${phone}`);
  }

  async deleteUser(phoneExact: string): Promise<void> {
    // Deletes by the EXACT stored value (no normalization) so this can
    // also remove legacy rows that predate normalizePhone() and would
    // never match a normalized lookup.
    const pool = getDatabase();
    await pool.query('DELETE FROM whitelist WHERE phone_number = $1', [phoneExact]);
    await pool.query('DELETE FROM users WHERE phone_number = $1', [phoneExact]);

    // Invalidate cache under both the raw and normalized key, in case
    // either was ever cached.
    await redis.del(`whitelist:${phoneExact}`);
    await redis.del(`whitelist:${normalizePhone(phoneExact)}`);
  }

  async listUsers(): Promise<WhitelistEntry[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT phone_number, permitted_until, status, created_at, updated_at FROM whitelist ORDER BY created_at DESC'
    );
    return result.rows;
  }
}
