import { Queue } from 'bullmq';
import { getRedis } from '../config/redis';
import { getDatabase } from '../config/database';
import { Reminder } from '../types/index';

export class ReminderService {
  private reminderQueue: Queue | null = null;

  async getQueue(): Promise<Queue> {
    if (!this.reminderQueue) {
      const redis = await getRedis();
      this.reminderQueue = new Queue('reminders', { connection: redis });
    }
    return this.reminderQueue;
  }

  async scheduleReminder(
    phone: string,
    scheduledFor: Date,
    message: string,
    isRecurring: boolean = false
  ): Promise<Reminder> {
    const pool = getDatabase();

    const result = await pool.query(
      'INSERT INTO reminders (phone_number, type, scheduled_for, message, recurrence_rule) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        phone,
        isRecurring ? 'recurring' : 'one_time',
        scheduledFor,
        message,
        isRecurring ? `FREQ=DAILY;BYHOUR=${scheduledFor.getHours()}` : null
      ]
    );

    const reminder = result.rows[0];

    // Add job to BullMQ
    const queue = await this.getQueue();
    const delay = scheduledFor.getTime() - Date.now();
    await queue.add(
      'send-reminder',
      {
        reminderId: reminder.id,
        phone,
        message
      },
      { delay: Math.max(0, delay) }
    );

    return reminder;
  }

  async getRemindersByUser(phone: string): Promise<Reminder[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT * FROM reminders WHERE phone_number = $1 ORDER BY scheduled_for DESC',
      [phone]
    );

    return result.rows;
  }

  async initializeWorker(): Promise<void> {
    console.log('Reminder worker initialized (configured via separate worker file)');
  }
}
