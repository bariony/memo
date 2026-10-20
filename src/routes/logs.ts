import { Router, Request, Response } from 'express';
import { logsService } from '../services/logs.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { LogLevel } from '../utils/logger.js';
import { errors } from '../utils/errors.js';

const router = Router();

// All routes require admin authentication
router.use(authMiddleware);

/**
 * GET /admin/logs
 * Get paginated logs with filters
 *
 * Query params:
 * - level: ERROR|WARN|INFO|DEBUG
 * - limit: number (default 100, max 500)
 * - offset: number (default 0)
 * - hours: number (default 24, max 720)
 * - search: string (searches in message, error, context, requestId)
 * - context: string (filter by context name)
 */
router.get('/logs', asyncHandler(async (req: any, res: Response) => {
  const { level, limit, offset, hours, search, context } = req.query;

  // Validate and parse parameters
  const parsedLimit = Math.min(parseInt(limit) || 100, 500);
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);
  const parsedHours = Math.min(parseInt(hours) || 24, 720);

  const result = logsService.getLogs({
    level: level as LogLevel,
    limit: parsedLimit,
    offset: parsedOffset,
    hours: parsedHours,
    search: search as string,
    context: context as string,
  });

  res.json(result);
}));

/**
 * GET /admin/logs/levels
 * Get available log levels
 */
router.get('/logs/levels', asyncHandler(async (req: any, res: Response) => {
  res.json({
    success: true,
    levels: logsService.getLogLevels(),
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /admin/logs/contexts
 * Get available log contexts
 */
router.get('/logs/contexts', asyncHandler(async (req: any, res: Response) => {
  res.json({
    success: true,
    contexts: logsService.getLogContexts(),
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /admin/logs/stats
 * Get log statistics
 */
router.get('/logs/stats', asyncHandler(async (req: any, res: Response) => {
  const stats = logsService.getLogStats();

  res.json({
    success: true,
    stats,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /admin/logs/clear
 * Clear logs older than specified days
 *
 * Body:
 * - daysToKeep: number (default 30)
 */
router.post(
  '/logs/clear',
  asyncHandler(async (req: any, res: Response) => {
    const { daysToKeep } = req.body;

    if (daysToKeep !== undefined && (typeof daysToKeep !== 'number' || daysToKeep < 1)) {
      throw errors.invalidInput('daysToKeep', 'Must be a positive number');
    }

    const deletedCount = logsService.clearOldLogs(daysToKeep || 30);

    res.json({
      success: true,
      message: `Cleared ${deletedCount} old log files`,
      deletedCount,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
