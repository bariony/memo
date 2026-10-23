import { Worker, Queue } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { getDatabase } from '../config/database.js';
import { evolution } from '../services/evolution.service.js';

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Next occurrence after `from` for FREQ=DAILY or FREQ=WEEKLY;BYDAY=TU,TH (São Paulo is a fixed UTC-3, so weekday math is done on the -3h shifted clock). */
export function nextOccurrence(from: Date, rule?: string | null): Date {
  const days = (rule?.match(/BYDAY=([A-Z,]+)/)?.[1] || '').split(',').filter(Boolean);
  const next = new Date(from);
  for (let i = 0; i < 8; i++) {
    next.setTime(next.getTime() + 24 * 60 * 60 * 1000);
    if (days.length === 0) return next;
    const local = new Date(next.getTime() - 3 * 60 * 60 * 1000);
    if (days.includes(DAY_CODES[local.getUTCDay()])) return next;
  }
  return next;
}

export async function initializeReminderWorker() {
  const reminderQueue = new Queue('reminders', { connection: getBullMQConnection() });

  const worker = new Worker('reminders', async (job: any) => {
      const { reminderId, phone, message } = job.data;
      const pool = getDatabase();

      try {
        const result = await pool.query(
          'SELECT type, scheduled_for, sent, recurrence_rule FROM reminders WHERE id = $1',
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
          const nextScheduledFor = nextOccurrence(new Date(reminder.scheduled_for), reminder.recurrence_rule);

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
