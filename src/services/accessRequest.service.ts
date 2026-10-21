import { getDatabase } from '../config/database.js';
import { normalizePhone } from '../utils/validator.js';
import { AccessRequest } from '../types/index.js';

export class AccessRequestService {
  /**
   * Records a pending access request for a phone number, unless one is
   * already open for it (the partial unique index on the table enforces
   * this - a repeat message from someone already waiting shouldn't ping
   * the admin again every time). Returns whether this call actually
   * created a new request.
   */
  async createIfNotPending(phoneRaw: string, name: string): Promise<{ isNew: boolean; request: AccessRequest }> {
    const phone = normalizePhone(phoneRaw);
    const pool = getDatabase();

    const existing = await pool.query(
      `SELECT * FROM access_requests WHERE phone_number = $1 AND status = 'pending'`,
      [phone]
    );

    if (existing.rows.length > 0) {
      return { isNew: false, request: existing.rows[0] };
    }

    const result = await pool.query(
      `INSERT INTO access_requests (phone_number, name) VALUES ($1, $2) RETURNING *`,
      [phone, name]
    );

    return { isNew: true, request: result.rows[0] };
  }

  async listPending(): Promise<AccessRequest[]> {
    const pool = getDatabase();
    const result = await pool.query(
      `SELECT * FROM access_requests WHERE status = 'pending' ORDER BY created_at ASC`
    );
    return result.rows;
  }

  async findPendingByPhone(phoneRaw: string): Promise<AccessRequest | null> {
    const phone = normalizePhone(phoneRaw);
    const pool = getDatabase();
    const result = await pool.query(
      `SELECT * FROM access_requests WHERE phone_number = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    return result.rows[0] || null;
  }

  async resolve(id: string, status: 'approved' | 'denied'): Promise<AccessRequest | null> {
    const pool = getDatabase();
    const result = await pool.query(
      `UPDATE access_requests SET status = $1, resolved_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  async resolveByPhone(phoneRaw: string, status: 'approved' | 'denied'): Promise<AccessRequest | null> {
    const phone = normalizePhone(phoneRaw);
    const pool = getDatabase();
    const result = await pool.query(
      `UPDATE access_requests SET status = $1, resolved_at = NOW()
       WHERE phone_number = $2 AND status = 'pending' RETURNING *`,
      [status, phone]
    );
    return result.rows[0] || null;
  }
}

export const accessRequestService = new AccessRequestService();
