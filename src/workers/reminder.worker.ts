import { Worker, Queue } from 'bullmq';
import { getRedis } from '../config/redis';
import { getDatabase } from '../config/database';
import { EvolutionService } from '../services/evolution.service';

export async function initializeReminderWorker() {
  const redis = await getRedis();
  const reminderQueue = new Queue('reminders', { connection: redis });

  const worker = new Worker(
    'reminders',
    async (job) => {
      const { reminderId, phone, message } = job.data;
      const pool = getDatabase();
      const evolutionService = new EvolutionService();

      try {
        await evolutionService.sendMessage(phone, message);
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
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  console.log('Reminder worker initialized');
}
