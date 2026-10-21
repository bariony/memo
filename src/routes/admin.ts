import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { WhitelistService } from '../services/whitelist.service.js';
import { accessRequestService } from '../services/accessRequest.service.js';
import { evolution } from '../services/evolution.service.js';
import { buildWelcomeMessage } from '../services/message.service.js';
import { requireAuth, generateAdminToken } from '../middleware/auth.js';
import { getEnv } from '../config/env.js';
import { getDatabase } from '../config/database.js';
import { redis, connectRedis } from '../config/redis.js';
import { logsService } from '../services/logs.service.js';
import { LogLevel } from '../utils/logger.js';
import { isValidNormalizedPhone } from '../utils/validator.js';

const router = Router();
const whitelistService = new WhitelistService();
const env = getEnv();
const DEFAULT_TRIAL_DAYS = 14;

/** Constant-time string comparison, so a wrong password can't be brute-forced faster via response-time differences. */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Auth endpoint
router.post('/admin/auth', (req: Request, res: Response) => {
  const { password } = req.body;

  if (typeof password !== 'string' || !safeEquals(password, env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateAdminToken();
  res.json({ token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
});

// Get whitelist
router.get('/admin/whitelist', requireAuth, async (req: Request, res: Response) => {
  try {
    const users = await whitelistService.listUsers();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Add user
router.post('/admin/whitelist', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone, permitted_until } = req.body;

    if (!phone || !permitted_until) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isValidNormalizedPhone(phone)) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido' });
    }

    await whitelistService.addUser(phone, new Date(permitted_until));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Revoke user
router.patch('/admin/whitelist/:phone/revoke', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    await whitelistService.revokeUser(phone);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Delete user (exact stored match - also cleans up legacy/malformed entries)
router.delete('/admin/whitelist/:phone', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    await whitelistService.deleteUser(phone);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update expiration
router.patch('/admin/whitelist/:phone', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const { permitted_until } = req.body;

    if (!permitted_until) {
      return res.status(400).json({ error: 'permitted_until is required' });
    }

    await whitelistService.updateExpiration(phone, new Date(permitted_until));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// List pending access requests (people who messaged without access yet)
router.get('/admin/access-requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const requests = await accessRequestService.listPending();
    res.json({ requests });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Approve a pending access request - adds to the whitelist and notifies
// the person on WhatsApp. Mirrors the "aprovar <numero>" WhatsApp command
// the admin can also use directly from his phone.
router.post('/admin/access-requests/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const days = Number(req.body?.days) > 0 ? Number(req.body.days) : DEFAULT_TRIAL_DAYS;

    const requests = await accessRequestService.listPending();
    const request = requests.find((r) => r.id === id);
    if (!request) {
      return res.status(404).json({ error: 'Pedido não encontrado ou já resolvido' });
    }

    const permittedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await whitelistService.addUser(request.phone_number, permittedUntil, request.name ?? undefined);
    await accessRequestService.resolve(id, 'approved');

    const untilText = permittedUntil.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    await evolution.sendMessage(
      request.phone_number,
      buildWelcomeMessage(request.name, days, untilText)
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Deny a pending access request
router.post('/admin/access-requests/:id/deny', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const requests = await accessRequestService.listPending();
    const request = requests.find((r) => r.id === id);
    if (!request) {
      return res.status(404).json({ error: 'Pedido não encontrado ou já resolvido' });
    }

    await accessRequestService.resolve(id, 'denied');

    await evolution.sendMessage(
      request.phone_number,
      'Oi! Vi sua solicitação de acesso, mas não vou poder liberar dessa vez. Qualquer dúvida, é só chamar 😊'
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * Read-only aggregate for an external monitoring agent (not the admin
 * panel). Deliberately a separate, narrower credential from the admin
 * JWT/password - this only needs visibility into recent problems, not
 * the ability to manage users or anything else the admin token allows.
 *
 * GET /admin/health-report?hours=2
 * Header: x-monitor-key: <MONITOR_API_KEY>
 */
router.get('/admin/health-report', async (req: Request, res: Response) => {
  const provided = req.headers['x-monitor-key'];
  if (!env.MONITOR_API_KEY || typeof provided !== 'string' || !safeEquals(provided, env.MONITOR_API_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours as string) || 2, 1), 24);
    const pool = getDatabase();

    // Errors from the structured logger. These live on the container's own
    // filesystem, which is wiped on every redeploy - fine for a short
    // lookback window like this, not a historical record.
    const errorLogs = logsService.getLogs({ level: LogLevel.ERROR, hours, limit: 50 });

    // Messages that were processed but never reached the user - the
    // clearest signal of someone getting "frozen" with no reply.
    const failedDeliveries = await pool.query(
      `SELECT phone_number, message_text, intent, created_at FROM message_logs
       WHERE delivered = false AND created_at > NOW() - ($1 || ' hours')::interval
       ORDER BY created_at DESC LIMIT 50`,
      [hours]
    );

    // Replies that are themselves apology/fallback text - delivery
    // succeeded, but something upstream (parsing, a dependency) failed.
    const errorResponses = await pool.query(
      `SELECT phone_number, message_text, intent, response_text, created_at FROM message_logs
       WHERE created_at > NOW() - ($1 || ' hours')::interval
         AND (
           intent IN ('media_fetch_failed', 'receipt_unreadable', 'audio_fetch_failed', 'audio_transcription_failed')
           OR response_text ILIKE '%ocorreu um erro%'
           OR response_text ILIKE '%não consegui entender%'
           OR response_text ILIKE '%tive um problema%'
         )
       ORDER BY created_at DESC LIMIT 50`,
      [hours]
    );

    // Reminders that failed to send outright (the worker logs these).
    const failedReminders = await pool.query(
      `SELECT phone_number, message_text, error, created_at FROM failed_messages
       WHERE created_at > NOW() - ($1 || ' hours')::interval
       ORDER BY created_at DESC LIMIT 50`,
      [hours]
    );

    let databaseHealthy = true;
    try {
      await pool.query('SELECT 1');
    } catch {
      databaseHealthy = false;
    }

    let redisHealthy = true;
    try {
      if (!redis.isOpen) await connectRedis();
      await redis.ping();
    } catch {
      redisHealthy = false;
    }

    res.json({
      success: true,
      windowHours: hours,
      health: { database: databaseHealthy, redis: redisHealthy },
      errorLogs: errorLogs.logs,
      failedDeliveries: failedDeliveries.rows,
      errorResponses: errorResponses.rows,
      failedReminders: failedReminders.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Dashboard stats
router.get('/admin/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getDatabase();

    const activeUsers = await pool.query(
      'SELECT COUNT(*) FROM whitelist WHERE status = $1',
      ['active']
    );

    const totalExpenses = await pool.query('SELECT COUNT(*) FROM expenses');

    res.json({
      active_users: parseInt(activeUsers.rows[0].count),
      total_expenses: parseInt(totalExpenses.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
