import { Router, Request, Response } from 'express';
import { WhitelistService } from '../services/whitelist.service';
import { requireAuth, generateAdminToken } from '../middleware/auth';
import { getEnv } from '../config/env';
import { getDatabase } from '../config/database';

const router = Router();
const whitelistService = new WhitelistService();
const env = getEnv();

// Auth endpoint
router.post('/admin/auth', (req: Request, res: Response) => {
  const { password } = req.body;

  if (password !== env.ADMIN_PASSWORD) {
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
