import express, { Router } from 'express';
import { getDatabase } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /admin/analytics/users?days=7
router.get('/users', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const pool = getDatabase();

  const result = await pool.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as new_count,
      SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_count
    FROM users
    WHERE created_at > NOW() - INTERVAL '1 day' * $1
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [days]);

  res.json({ data: result.rows });
});

// GET /admin/analytics/messages?days=7
router.get('/messages', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const pool = getDatabase();

  const result = await pool.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM message_logs
    WHERE created_at > NOW() - INTERVAL '1 day' * $1
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [days]);

  res.json({ data: result.rows });
});

// GET /admin/analytics/tokens?days=7
router.get('/tokens', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const pool = getDatabase();

  const total = await pool.query(`
    SELECT SUM(tokens_consumed) as total
    FROM token_usage
    WHERE created_at > NOW() - INTERVAL '1 day' * $1
  `, [days]);

  const byUser = await pool.query(`
    SELECT
      phone_number,
      SUM(tokens_consumed) as tokens
    FROM token_usage
    WHERE created_at > NOW() - INTERVAL '1 day' * $1
    GROUP BY phone_number
    ORDER BY tokens DESC
    LIMIT 10
  `, [days]);

  res.json({
    total: total.rows[0]?.total || 0,
    byUser: byUser.rows
  });
});

// GET /admin/analytics/expenses?days=7
router.get('/expenses', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const pool = getDatabase();

  const result = await pool.query(`
    SELECT
      DATE(created_at) as date,
      SUM(amount) as total
    FROM expenses
    WHERE created_at > NOW() - INTERVAL '1 day' * $1
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [days]);

  res.json({ data: result.rows });
});

// GET /admin/analytics/recent-messages?limit=5
router.get('/recent-messages', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 5, 50);
  const pool = getDatabase();

  try {
    const result = await pool.query(`
      SELECT phone_number, message_text, created_at
      FROM message_logs
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Failed to load recent messages:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

export default router;
