import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEnv } from './config/env.js';
import { initializeReminderWorker } from './workers/reminder.worker.js';
import { initializeMessagingWorker } from './workers/messaging.worker.js';
import { initializeReengagementWorker } from './workers/reengagement.worker.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware, requestLoggerMiddleware, requestBodyLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rateLimiters } from './middleware/rateLimiter.js';
import { connectRedis, closeRedis } from './config/redis.js';
import webhookRoutes from './routes/webhook.js';
import healthRoutes from './routes/health.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import logsRoutes from './routes/logs.js';
import alertsRoutes from './routes/alerts.js';
import preferencesRoutes from './routes/preferences.js';
import expensesRoutes from './routes/expenses.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = getEnv();
const app = express();

// ════════════════════════════════════════════════════════════════
// CORE MIDDLEWARE
// ════════════════════════════════════════════════════════════════

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request tracking
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(requestBodyLogger);

// Serve admin panel static files
app.use(express.static(path.join(__dirname, '../admin')));

// ════════════════════════════════════════════════════════════════
// RATE LIMITING
// ════════════════════════════════════════════════════════════════

// Apply different rate limits to different endpoints
app.use('/admin/auth', rateLimiters.auth);
app.use('/webhook', rateLimiters.webhook);
app.use('/admin', rateLimiters.admin);
app.use('/', rateLimiters.api);

// ════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════

app.use('/', webhookRoutes);
app.use('/', healthRoutes);
app.use('/', adminRoutes);
app.use('/admin', analyticsRoutes);
app.use('/admin', logsRoutes);
app.use('/admin', alertsRoutes);
app.use('/user', preferencesRoutes);
app.use('/api', expensesRoutes);

// Health check on root
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Memo API is running',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// ════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ════════════════════════════════════════════════════════════════

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// ════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ════════════════════════════════════════════════════════════════

const PORT = env.PORT;
const server = app.listen(PORT, async () => {
  logger.info(`✓ Server running on port ${PORT}`, 'Server');
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, 'Server');

  // Connect to Redis
  try {
    await connectRedis();
    logger.info('✓ Redis connected', 'Server');
  } catch (err) {
    logger.error('Failed to connect to Redis', err, 'Server');
  }

  // Initialize BullMQ workers
  try {
    await initializeReminderWorker();
    logger.info('✓ Reminder worker initialized', 'Worker');
  } catch (err) {
    logger.error('Failed to initialize reminder worker', err, 'Worker');
  }

  try {
    await initializeMessagingWorker();
    logger.info('✓ Messaging worker initialized', 'Worker');
  } catch (err) {
    logger.error('Failed to initialize messaging worker', err, 'Worker');
  }

  try {
    await initializeReengagementWorker();
    logger.info('✓ Re-engagement worker initialized', 'Worker');
  } catch (err) {
    logger.error('Failed to initialize re-engagement worker', err, 'Worker');
  }
});

// ════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ════════════════════════════════════════════════════════════════

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`, 'Server');

  server.close(() => {
    logger.info('Server closed', 'Server');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown - graceful timeout exceeded', undefined, 'Server');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err, 'Process');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason as Error, 'Process');
  process.exit(1);
});

export default app;
