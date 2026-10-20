import { Worker, Queue } from 'bullmq';
import { redis, connectRedis } from '../config/redis.js';
import { getDatabase } from '../config/database.js';
import { evolution } from '../services/evolution.service.js';

export async function initializeReminderWorker() {
  const reminderQueue = new Queue('reminders', { connection: { host: 'localhost', port: 6379 } as any });

  const worker = new Worker('reminders', async (job: any) => {
      const { reminderId, phone, message } = job.data;
      const pool = getDatabase();

      try {
        await evolution.sendMessage(phone, message);
        await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminderId]);
        console.log(`✓ Reminder sent to ${phone}`);
      } catch (error) {
        console.error(`✗ Failed to send reminder to ${phone}:`, error);
        await pool.query(
          'INSERT INTO failed_messages (phone_number, message_text, error) VALUES ($1, $2, $3)',
          [phone, message, JSON.stringify(error)]
        );
        throw error;
      }
  }, { connection: { host: 'localhost', port: 6379 } as any, concurrency: 5 });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  console.log('Reminder worker initialized');
}
