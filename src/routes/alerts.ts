import { Router, Request, Response } from 'express';
import { resilience, AlertSeverity } from '../utils/resilience.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require admin authentication
router.use(authMiddleware);

/**
 * GET /admin/alerts
 * Get all active alerts with optional filtering
 *
 * Query params:
 * - severity: INFO|WARNING|ERROR|CRITICAL
 * - userId: filter by specific user
 * - limit: max results (default 100)
 */
router.get('/alerts', asyncHandler(async (req: any, res: Response) => {
  const { severity, userId, limit } = req.query;

  const allAlerts = userId
    ? resilience.getAlerts(userId)
    : resilience.getAlerts();

  let filtered = allAlerts;

  // Filter by severity
  if (severity) {
    filtered = filtered.filter((a) => a.severity === severity);
  }

  // Limit results
  const maxResults = Math.min(parseInt(limit) || 100, 1000);
  const paginated = filtered.slice(0, maxResults);

  res.json({
    success: true,
    alerts: paginated,
    total: allAlerts.length,
    filtered: filtered.length,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /admin/alerts/summary
 * Get alert summary and statistics
 */
router.get('/alerts/summary', asyncHandler(async (req: any, res: Response) => {
  const alerts = resilience.getAlerts();

  const summary = {
    total: alerts.length,
    bySeverity: {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.ERROR]: 0,
      [AlertSeverity.CRITICAL]: 0,
    },
    byType: {} as Record<string, number>,
    topUsers: [] as Array<{ userId: string; count: number }>,
  };

  const userCounts = new Map<string, number>();

  alerts.forEach((alert) => {
    summary.bySeverity[alert.severity]++;
    summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;

    if (alert.userId) {
      userCounts.set(alert.userId, (userCounts.get(alert.userId) || 0) + 1);
    }
  });

  // Top stressed users
  summary.topUsers = Array.from(userCounts.entries())
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /admin/alerts/:alertId
 * Get alert details
 */
router.get('/alerts/:alertId', asyncHandler(async (req: any, res: Response) => {
  const { alertId } = req.params;
  const alerts = resilience.getAlerts();
  const alert = alerts.find((a) => a.timestamp === alertId);

  if (!alert) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Alert not found' },
    });
  }

  res.json({
    success: true,
    alert,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /admin/alerts/:alertId/resolve
 * Resolve/acknowledge an alert
 */
router.post('/alerts/:alertId/resolve', asyncHandler(async (req: any, res: Response) => {
  const { alertId } = req.params;

  resilience.resolveAlert(alertId);
  logger.info(`Alert resolved: ${alertId}`, 'AlertsRoute', undefined, req.id);

  res.json({
    success: true,
    message: 'Alert resolved',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /admin/alerts/clear
 * Clear all or user-specific alerts
 *
 * Body:
 * - userId: clear only for this user (optional)
 */
router.post('/alerts/clear', asyncHandler(async (req: any, res: Response) => {
  const { userId } = req.body;

  resilience.clearAlerts(userId);
  logger.info(
    `Alerts cleared${userId ? ` for user: ${userId}` : ''}`,
    'AlertsRoute',
    undefined,
    req.id
  );

  res.json({
    success: true,
    message: 'Alerts cleared',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /admin/health
 * Get system health status
 */
router.get('/health', asyncHandler(async (req: any, res: Response) => {
  const health = resilience.getHealth();

  res.status(health.status === 'unhealthy' ? 503 : 200).json({
    success: true,
    health,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /admin/alerts/user/:userPhone
 * Get alerts for a specific user
 */
router.get('/alerts/user/:userPhone', asyncHandler(async (req: any, res: Response) => {
  const { userPhone } = req.params;

  const alerts = resilience.getAlerts(userPhone);

  res.json({
    success: true,
    userPhone,
    alerts,
    total: alerts.length,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
