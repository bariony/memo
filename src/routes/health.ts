import { Router, Request, Response } from 'express';
import { getDatabase } from '../config/database.js';
import { redis, connectRedis } from '../config/redis.js';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database
    const pool = getDatabase();
    await pool.query('SELECT 1');

    // Check Redis
    if (!redis.isOpen) {
      await connectRedis();
    }
    await redis.ping();

    res.status(200).json({ status: 'healthy', timestamp: new Date() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

export default router;
