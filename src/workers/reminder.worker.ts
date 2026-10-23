import { Worker, Queue } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { getDatabase } from '../config/database.js';
import { evolution } from '../services/evolution.service.js';

export async function initializeReminderWorker() {
  const reminderQueue = new Queue('reminders', { connection: getBullMQConnection() });

  const worker = new Worker('reminders', async (job: any) => {
      const { reminderId, phone, message } = job.data;
      const pool = getDatabase();

      try {
        const result = await pool.query(
          'SELECT type, scheduled_for, sent FROM reminders WHERE id = $1',
          [reminderId]
        );
        const reminder = result.rows[0];

        // Cancelled (row deleted) or already delivered: don't send.
        if (!reminder || reminder.sent) return;

        await evolution.sendMessage(phone, message);

        if (reminder?.type === 'recurring') {
          // Reschedule the same reminder for the same time tomorrow instead
          // of letting it fire once and go silent - "todos os dias" has to
          // actually mean every day.
          const nextScheduledFor = new Date(reminder.scheduled_for);
          nextScheduledFor.setDate(nextScheduledFor.getDate() + 1);

          await pool.query(
            'UPDATE reminders SET scheduled_for = $1, sent = false WHERE id = $2',
            [nextScheduledFor, reminderId]
          );

          const delay = nextScheduledFor.getTime() - Date.now();
          await reminderQueue.add(
            'send-reminder',
            { reminderId, phone, message },
            { delay: Math.max(0, delay) }
          );
        } else {
          await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminderId]);
        }

        console.log(`✓ Reminder sent to ${phone}`);
      } catch (error) {
        console.error(`✗ Failed to send reminder to ${phone}:`, error);
        await pool.query(
          'INSERT INTO failed_messages (phone_number, message_text, error) VALUES ($1, $2, $3)',
          [phone, message, JSON.stringify(error)]
        );
        throw error;
      }
  }, { connection: getBullMQConnection(), concurrency: 5 });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  // Without this, a Redis connection error on this worker is an unhandled
  // 'error' event, which Node treats as an uncaught exception - and this
  // app's uncaughtException handler calls process.exit(1), killing the
  // whole server (webhook included) over a transient Redis blip.
  worker.on('error', (err) => {
    console.error('Reminder worker connection error:', err.message);
  });

  console.log('Reminder worker initialized');
}
