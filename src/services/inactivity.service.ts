import { logger } from '../utils/logger.js';

/**
 * Inactivity detection service
 * Determines if a user has been inactive for a specified duration
 */

interface UserActivity {
  phoneNumber: string;
  lastInteractionAt: Date;
  userName?: string;
}

const INACTIVITY_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Check if user is inactive (no interaction for 48+ hours)
 */
export function isUserInactive(lastInteractionTime: Date): boolean {
  const now = new Date();
  const timeSinceLastInteraction = now.getTime() - lastInteractionTime.getTime();
  return timeSinceLastInteraction >= INACTIVITY_THRESHOLD_MS;
}

/**
 * Get hours since last interaction
 */
export function getHoursSinceLastInteraction(lastInteractionTime: Date): number {
  const now = new Date();
  const timeSinceLastInteraction = now.getTime() - lastInteractionTime.getTime();
  return Math.floor(timeSinceLastInteraction / (1000 * 60 * 60));
}

/**
 * Get percentage of inactivity threshold reached
 * Returns 0-100, where 100 = 48 hours
 */
export function getInactivityPercentage(lastInteractionTime: Date): number {
  const hoursSince = getHoursSinceLastInteraction(lastInteractionTime);
  return Math.min(100, Math.round((hoursSince / 48) * 100));
}

/**
 * Get user activity status with details
 */
export function getUserActivityStatus(lastInteractionTime: Date) {
  const hoursSince = getHoursSinceLastInteraction(lastInteractionTime);
  const isInactive = isUserInactive(lastInteractionTime);
  const percentage = getInactivityPercentage(lastInteractionTime);

  let status: 'active' | 'at_risk' | 'inactive' = 'active';
  if (isInactive) {
    status = 'inactive';
  } else if (hoursSince >= 24) {
    status = 'at_risk';
  }

  return {
    status,
    hoursSinceLastInteraction: hoursSince,
    inactivityPercentage: percentage,
    isInactive,
    lastInteractionTime,
  };
}

/**
 * TODO: Database integration function
 * This will be implemented when database layer is ready
 */
export async function checkUserInactivityStatus(phoneNumber: string) {
  // TODO: Fetch from database
  // const user = await db.users.findByPhone(phoneNumber);
  // return getUserActivityStatus(new Date(user.lastInteractionAt));

  logger.debug(
    `Inactivity check placeholder - implement when database is ready`,
    'InactivityService',
    { phoneNumber }
  );

  return null;
}

/**
 * TODO: Update user's last interaction time in database
 * Call this every time user sends a message
 */
export async function updateUserLastInteraction(phoneNumber: string) {
  // TODO: Update database
  // await db.users.update(phoneNumber, {
  //   lastInteractionAt: new Date()
  // });

  logger.debug(
    `Last interaction update placeholder - implement when database is ready`,
    'InactivityService',
    { phoneNumber }
  );
}
