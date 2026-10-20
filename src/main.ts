import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEnv } from './config/env';
import { initializeReminderWorker } from './workers/reminder.worker';
import webhookRoutes from './routes/webhook';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = getEnv();
const app = express();

// Middleware
app.use(express.json());

// Serve admin panel static files
app.use(express.static(path.join(__dirname, '../admin')));

// Routes
app.use('/', webhookRoutes);
app.use('/', healthRoutes);
app.use('/', adminRoutes);

// Health check on root
app.get('/', (req, res) => {
  res.json({ message: 'Memo API is running' });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = env.PORT;
const server = app.listen(PORT, async () => {
  console.log(`✓ Server running on port ${PORT}`);

  // Initialize BullMQ worker
  try {
    await initializeReminderWorker();
  } catch (err) {
    console.error('Failed to initialize reminder worker:', err);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
