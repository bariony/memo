import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { generateReEngagementMessage } from '../services/userMessaging.service.js';
import { evolution } from '../services/evolution.service.js';

/**
 * Re-engagement Queue for BullMQ
 * Handles periodic checks for inactive users and sends re-engagement messages
 */
export const reengagementQueue = new Queue('reengagement', { connection: redis });

/**
 * Initialize re-engagement worker
 * This worker runs periodic checks for user inactivity (48h+ without interaction)
 */
export async function initializeReengagementWorker() {
  const worker = new Worker(
    'reengagement',
    async (job) => {
      try {
        const { phoneNumber, userName } = job.data;

        logger.debug(
          `Checking re-engagement for user`,
          'ReengagementWorker',
          { phoneNumber }
        );

        // In production: fetch last_interaction timestamp from database
        // const user = await db.users.getByPhone(phoneNumber);
        // const lastInteractionTime = new Date(user.lastInteractionAt);
        // const hoursSinceInteraction = (Date.now() - lastInteractionTime.getTime()) / (1000 * 60 * 60);
        //
        // if (hoursSinceInteraction >= 48) {
        //   // Send re-engagement message
        //   const message = generateReEngagementMessage({
        //     userName,
        //     hoursSinceLastInteraction: Math.floor(hoursSinceInteraction),
        //   });
        //
        //   await evolution.sendMessage(phoneNumber, message);
        //   logger.info(
        //     `Re-engagement message sent`,
        //     'ReengagementWorker',
        //     { phoneNumber, hoursSinceInteraction }
        //   );
        // }

        // Mock: log that check would happen
        logger.debug(
          `Re-engagement check (mock) - would check last interaction time`,
          'ReengagementWorker',
          { phoneNumber }
        );

        return { success: true, phoneNumber, checked: true };
      } catch (err) {
        logger.error('Error in re-engagement check', err, 'ReengagementWorker', {
          jobId: job.id,
          jobData: job.data,
        });
        throw err;
      }
    },
    { connection: redis }
  );

  worker.on('completed', (job) => {
    logger.debug(`Re-engagement check completed: ${job.id}`, 'ReengagementWorker');
  });

  worker.on('failed', (job, err) => {
    logger.error(`Re-engagement check failed: ${job?.id}`, err, 'ReengagementWorker');
  });

  return worker;
}

/**
 * Schedule periodic re-engagement check for a user
 * Runs every 6 hours to check if user has been inactive for 48+ hours
 */
export async function scheduleReengagementCheck(phoneNumber: string, userName?: string) {
  // Cron: every 6 hours
  const cronExpression = '0 */6 * * *';

  await reengagementQueue.add(
    `reengagement-${phoneNumber}`,
    {
      phoneNumber,
      userName,
    },
    {
      repeat: {
        pattern: cronExpression,
      },
      jobId: `reengagement-${phoneNumber}`,
      removeOnComplete: false, // Keep job history
    }
  );

  logger.info(
    `Re-engagement check scheduled for user`,
    'ReengagementWorker',
    {
      phoneNumber,
      checkInterval: 'every 6 hours',
      inactivityThreshold: '48 hours',
    }
  );
}

/**
 * Cancel re-engagement checks for a user
 */
export async function cancelReengagementCheck(phoneNumber: string) {
  const repeatableJobs = await reengagementQueue.getRepeatableJobs();

  const userJob = repeatableJobs.find((job) => job.id === `reengagement-${phoneNumber}`);

  if (userJob) {
    await reengagementQueue.removeRepeatableByKey(userJob.key);
    logger.info(
      `Re-engagement check canceled`,
      'ReengagementWorker',
      { phoneNumber }
    );
  }
}

/**
 * Send re-engagement message immediately
 * Used for testing or manual triggers
 */
export async function sendReengagementMessageNow(
  phoneNumber: string,
  userName?: string,
  hoursSinceLastInteraction: number = 48
): Promise<boolean> {
  try {
    const message = generateReEngagementMessage({
      userName,
      hoursSinceLastInteraction,
    });

    const success = await evolution.sendMessage(phoneNumber, message);

    if (success) {
      logger.info(
        `Re-engagement message sent immediately`,
        'ReengagementWorker',
        {
          phoneNumber,
          hoursSinceLastInteraction,
        }
      );
    }

    return success;
  } catch (err) {
    logger.error('Error sending re-engagement message', err, 'ReengagementWorker');
    return false;
  }
}
