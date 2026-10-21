import { Queue, Worker } from 'bullmq';
import { getBullMQConnection } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { generateDailySummary, generateRenewalReminder7Days, generateRenewalReminder2Days, generateRenewalReminder1Day, generateReEngagementMessage } from '../services/userMessaging.service.js';
import { evolution } from '../services/evolution.service.js';

/**
 * Message Queue for BullMQ
 */
export const messagingQueue = new Queue('messaging', {
  connection: getBullMQConnection(),
});

messagingQueue.on('error', (err) => {
  logger.error('Messaging queue connection error', err, 'MessagingWorker');
});

/**
 * Job types
 */
export enum MessageJobType {
  DAILY_SUMMARY = 'daily_summary',
  RENEWAL_REMINDER_7D = 'renewal_reminder_7d',
  RENEWAL_REMINDER_2D = 'renewal_reminder_2d',
  RENEWAL_REMINDER_1D = 'renewal_reminder_1d',
  SPENDING_ALERT = 'spending_alert',
  TASK_REMINDER = 'task_reminder',
  WELCOME = 'welcome',
  RE_ENGAGEMENT = 're_engagement',
}

export interface MessageJob {
  phoneNumber: string;
  type: MessageJobType;
  data: Record<string, any>;
}

/**
 * Initialize messaging worker
 */
export async function initializeMessagingWorker() {
  const worker = new Worker('messaging', async (job: any) => {
    try {
      const { phoneNumber, type, data } = job.data as MessageJob;

      let message = '';

      switch (type) {
        case MessageJobType.DAILY_SUMMARY:
          message = generateDailySummary(data as any);
          break;
        case MessageJobType.RENEWAL_REMINDER_7D:
          message = generateRenewalReminder7Days(data as any);
          break;
        case MessageJobType.RENEWAL_REMINDER_2D:
          message = generateRenewalReminder2Days(data as any);
          break;
        case MessageJobType.RENEWAL_REMINDER_1D:
          message = generateRenewalReminder1Day(data as any);
          break;
        case MessageJobType.WELCOME:
          message = data.message; // Pre-generated welcome message
          break;
        case MessageJobType.RE_ENGAGEMENT:
          message = generateReEngagementMessage(data as any);
          break;
        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      // Send via Evolution API/WhatsApp
      await evolution.sendMessage(phoneNumber, message);

      logger.info(
        `Message sent via queue`,
        'MessagingWorker',
        { phoneNumber, type, messageLength: message.length }
      );

      return { success: true, phoneNumber, type };
    } catch (err) {
      logger.error('Error processing messaging job', err, 'MessagingWorker', {
        jobId: job.id,
        jobData: job.data,
      });
      throw err;
    }
  }, { connection: getBullMQConnection() });

  worker.on('completed', (job) => {
    logger.debug(`Job completed: ${job.id}`, 'MessagingWorker');
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed: ${job?.id}`, err, 'MessagingWorker');
  });

  worker.on('error', (err) => {
    logger.error('Messaging worker connection error', err, 'MessagingWorker');
  });

  return worker;
}

/**
 * Schedule daily summary for a user
 */
export async function scheduleDailySummary(
  phoneNumber: string,
  summaryTime: string, // "HH:MM"
  summaryData: Record<string, any>
) {
  // Parse time
  const [hours, minutes] = summaryTime.split(':').map(Number);

  // Calculate next run
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(hours, minutes, 0, 0);

  // If time has passed today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const delay = nextRun.getTime() - now.getTime();

  // Use cron instead for recurring: every day at specified time
  const cronExpression = `${minutes} ${hours} * * *`; // Every day at HH:MM

  await messagingQueue.add(
    MessageJobType.DAILY_SUMMARY,
    {
      phoneNumber,
      type: MessageJobType.DAILY_SUMMARY,
      data: summaryData,
    },
    {
      repeat: {
        pattern: cronExpression, // Daily at specified time
      },
      jobId: `daily-summary-${phoneNumber}`,
    }
  );

  logger.info(
    `Daily summary scheduled`,
    'MessagingWorker',
    { phoneNumber, time: summaryTime, cronExpression }
  );
}

/**
 * Schedule renewal reminder (7, 2, 1 days before expiry)
 */
export async function scheduleRenewalReminders(phoneNumber: string, expiryDate: Date, userName?: string) {
  const now = new Date();

  // 7 days before
  const date7Days = new Date(expiryDate);
  date7Days.setDate(date7Days.getDate() - 7);

  if (date7Days > now) {
    const delay7 = date7Days.getTime() - now.getTime();
    await messagingQueue.add(
      MessageJobType.RENEWAL_REMINDER_7D,
      {
        phoneNumber,
        type: MessageJobType.RENEWAL_REMINDER_7D,
        data: { userName, daysRemaining: 7 },
      },
      {
        delay: delay7,
        jobId: `renewal-7d-${phoneNumber}`,
        removeOnComplete: true,
      }
    );
  }

  // 2 days before
  const date2Days = new Date(expiryDate);
  date2Days.setDate(date2Days.getDate() - 2);

  if (date2Days > now) {
    const delay2 = date2Days.getTime() - now.getTime();
    await messagingQueue.add(
      MessageJobType.RENEWAL_REMINDER_2D,
      {
        phoneNumber,
        type: MessageJobType.RENEWAL_REMINDER_2D,
        data: { userName, daysRemaining: 2 },
      },
      {
        delay: delay2,
        jobId: `renewal-2d-${phoneNumber}`,
        removeOnComplete: true,
      }
    );
  }

  // 1 day before
  const date1Day = new Date(expiryDate);
  date1Day.setDate(date1Day.getDate() - 1);

  if (date1Day > now) {
    const delay1 = date1Day.getTime() - now.getTime();
    await messagingQueue.add(
      MessageJobType.RENEWAL_REMINDER_1D,
      {
        phoneNumber,
        type: MessageJobType.RENEWAL_REMINDER_1D,
        data: { userName, daysRemaining: 1 },
      },
      {
        delay: delay1,
        jobId: `renewal-1d-${phoneNumber}`,
        removeOnComplete: true,
      }
    );
  }

  logger.info(
    `Renewal reminders scheduled`,
    'MessagingWorker',
    { phoneNumber, expiryDate: expiryDate.toISOString() }
  );
}

/**
 * Send immediate message
 */
export async function sendImmediateMessage(
  phoneNumber: string,
  type: MessageJobType,
  messageData: Record<string, any>
) {
  await messagingQueue.add(
    type,
    {
      phoneNumber,
      type,
      data: messageData,
    },
    {
      priority: 10, // High priority for immediate messages
      removeOnComplete: true,
    }
  );

  logger.info(
    `Immediate message queued`,
    'MessagingWorker',
    { phoneNumber, type }
  );
}

/**
 * Cancel scheduled messages for a user
 */
export async function cancelScheduledMessages(phoneNumber: string) {
  const repeatableJobs = await messagingQueue.getRepeatableJobs();

  const userJobs = repeatableJobs.filter((job) => job.id.includes(phoneNumber));

  for (const job of userJobs) {
    await messagingQueue.removeRepeatableByKey(job.key);
  }

  logger.info(
    `Scheduled messages canceled`,
    'MessagingWorker',
    { phoneNumber, count: userJobs.length }
  );
}

/**
 * Schedule re-engagement check for user (48h inactivity)
 * Check runs every 6 hours to see if user has been inactive
 */
export async function scheduleReEngagementCheck(phoneNumber: string) {
  // Check every 6 hours: 0 */6 * * *
  const cronExpression = '0 */6 * * *';

  await messagingQueue.add(
    're-engagement-check',
    {
      phoneNumber,
      type: 're-engagement-check',
      data: { phoneNumber },
    },
    {
      repeat: {
        pattern: cronExpression, // Every 6 hours
      },
      jobId: `re-engagement-check-${phoneNumber}`,
    }
  );

  logger.info(
    `Re-engagement check scheduled`,
    'MessagingWorker',
    { phoneNumber, checkInterval: '6 hours' }
  );
}

/**
 * Check user inactivity and send re-engagement message if needed
 * In production, this would query the database for last_interaction timestamp
 */
export async function checkAndSendReEngagementMessage(
  phoneNumber: string,
  userName?: string
): Promise<boolean> {
  try {
    // Mock: In production, fetch last_interaction from database
    // For now, returning false means "user was active recently"
    // This would be implemented when database integration happens

    logger.debug(
      `Re-engagement check - would query last interaction time`,
      'MessagingWorker',
      { phoneNumber }
    );

    // TODO: Implement database check
    // const lastInteraction = await db.users.getLastInteractionTime(phoneNumber);
    // const hoursSinceInteraction = (Date.now() - lastInteraction) / (1000 * 60 * 60);
    //
    // if (hoursSinceInteraction >= 48) {
    //   await sendImmediateMessage(
    //     phoneNumber,
    //     MessageJobType.RE_ENGAGEMENT,
    //     {
    //       userName,
    //       hoursSinceLastInteraction: Math.floor(hoursSinceInteraction),
    //     }
    //   );
    //   return true;
    // }

    return false;
  } catch (err) {
    logger.error('Error checking user inactivity', err, 'MessagingWorker', {
      phoneNumber,
    });
    return false;
  }
}
