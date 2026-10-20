import { Router, Request, Response } from 'express';
import { WhitelistService } from '../services/whitelist.service.js';
import { requireAuth, generateAdminToken } from '../middleware/auth.js';
import { getEnv } from '../config/env.js';
import { getDatabase } from '../config/database.js';

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
router.get('/admin/whitelist', requireAuth, (req: Request, res: Response) => {
  // TODO: Connect to real database when migrations are complete
  // For now return mock data immediately (no async)
  res.json({ users: [
    {
      phone_number: '11986683737',
      permitted_until: '2026-10-23',
      status: 'active'
    }
  ] });
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
    // TODO: Connect to real database when migrations are complete
    // For now, return mock data
    res.json({
      active_users: 1,
      total_expenses: 0
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
