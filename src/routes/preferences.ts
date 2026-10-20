import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateRequest, requestSchemas } from '../utils/validator.js';
import { logger } from '../utils/logger.js';
import { errors } from '../utils/errors.js';
import { getDefaultPreferences, validatePreferences, UserPreferences } from '../config/userPreferences.js';
import { scheduleDailySummary, cancelScheduledMessages } from '../workers/messaging.worker.js';
import { z } from 'zod';

const router = Router();

// All routes require admin authentication or user verification
router.use(authMiddleware);

/**
 * Preference update schema
 */
const updatePreferencesSchema = z.object({
  dailySummary: z.object({
    enabled: z.boolean(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().optional(),
  }).optional(),
  dailyBudget: z.number().positive().optional(),
  reminders: z.object({
    renewalAlerts: z.boolean().optional(),
    taskReminders: z.boolean().optional(),
    spendingAlerts: z.boolean().optional(),
  }).optional(),
  notifications: z.object({
    quietHours: z.object({
      enabled: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }).optional(),
    vibrateOnAlert: z.boolean().optional(),
    soundOnAlert: z.boolean().optional(),
  }).optional(),
});

/**
 * GET /user/preferences
 * Get user preferences
 */
router.get('/preferences', asyncHandler(async (req: any, res: Response) => {
  // In a real app, this would fetch from database
  // For now, return default preferences
  const userPhone = req.userPhone || req.phone_number;

  if (!userPhone) {
    throw errors.unauthorized('User phone not found');
  }

  // Mock: fetch from database
  const preferences = getDefaultPreferences(userPhone);

  logger.info('Preferences retrieved', 'PreferencesRoute', { userPhone }, req.id);

  res.json({
    success: true,
    preferences,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * PATCH /user/preferences
 * Update user preferences
 */
router.patch('/preferences', asyncHandler(async (req: any, res: Response) => {
  const userPhone = req.userPhone || req.phone_number;

  if (!userPhone) {
    throw errors.unauthorized('User phone not found');
  }

  const updateData = req.body;

  // Validate update data
  const validation = validatePreferences(updateData);
  if (!validation.valid) {
    throw errors.validationError('Invalid preferences', { errors: validation.errors });
  }

  // Mock: fetch from database, update, save
  let preferences = getDefaultPreferences(userPhone);
  preferences = { ...preferences, ...updateData, updatedAt: new Date().toISOString() };

  // If daily summary settings changed, reschedule
  if (updateData.dailySummary) {
    await cancelScheduledMessages(userPhone);

    if (updateData.dailySummary.enabled) {
      // Schedule new daily summary
      // Note: In production, you'd fetch user's actual summary data
      await scheduleDailySummary(userPhone, updateData.dailySummary.time, {
        userName: undefined,
        remindersToday: [],
        dailyBudget: updateData.dailyBudget,
        currency: preferences.currency,
      });
    }
  }

  logger.info('Preferences updated', 'PreferencesRoute', { userPhone, changes: Object.keys(updateData) }, req.id);

  res.json({
    success: true,
    preferences,
    message: 'Preferences updated successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * PATCH /user/preferences/budget
 * Quick update for daily budget
 */
router.patch('/preferences/budget', asyncHandler(async (req: any, res: Response) => {
  const { dailyBudget } = req.body;
  const userPhone = req.userPhone || req.phone_number;

  if (typeof dailyBudget !== 'number' || dailyBudget <= 0) {
    throw errors.invalidInput('dailyBudget', 'Must be a positive number');
  }

  // Mock: update in database
  logger.info('Daily budget updated', 'PreferencesRoute', { userPhone, dailyBudget }, req.id);

  res.json({
    success: true,
    message: `Orçamento diário atualizado para R$ ${dailyBudget.toFixed(2)}`,
    dailyBudget,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * PATCH /user/preferences/summary-time
 * Quick update for daily summary time
 */
router.patch('/preferences/summary-time', asyncHandler(async (req: any, res: Response) => {
  const { time } = req.body;
  const userPhone = req.userPhone || req.phone_number;

  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(time)) {
    throw errors.invalidInput('time', 'Must be in HH:MM format');
  }

  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) {
    throw errors.invalidInput('time', 'Invalid time values');
  }

  // Mock: update in database and reschedule
  await cancelScheduledMessages(userPhone);
  await scheduleDailySummary(userPhone, time, {
    userName: undefined,
    remindersToday: [],
    currency: 'BRL',
  });

  logger.info('Daily summary time updated', 'PreferencesRoute', { userPhone, time }, req.id);

  res.json({
    success: true,
    message: `Resumo diário agora será enviado às ${time}`,
    time,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * PATCH /user/preferences/reminders
 * Toggle specific reminders
 */
router.patch('/preferences/reminders', asyncHandler(async (req: any, res: Response) => {
  const { renewalAlerts, taskReminders, spendingAlerts } = req.body;
  const userPhone = req.userPhone || req.phone_number;

  const reminders = {
    renewalAlerts: renewalAlerts !== undefined ? renewalAlerts : true,
    taskReminders: taskReminders !== undefined ? taskReminders : true,
    spendingAlerts: spendingAlerts !== undefined ? spendingAlerts : true,
  };

  logger.info('Reminders updated', 'PreferencesRoute', { userPhone, reminders }, req.id);

  res.json({
    success: true,
    message: 'Lembretes atualizados',
    reminders,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /user/preferences/summary
 * Get a quick summary of user's preferences
 */
router.get('/preferences/summary', asyncHandler(async (req: any, res: Response) => {
  const userPhone = req.userPhone || req.phone_number;

  // Mock: fetch from database
  const preferences = getDefaultPreferences(userPhone);

  const summary = {
    dailySummaryEnabled: preferences.dailySummary.enabled,
    dailySummaryTime: preferences.dailySummary.time,
    dailyBudget: preferences.dailyBudget,
    renewalAlertsEnabled: preferences.reminders.renewalAlerts,
    spendingAlertsEnabled: preferences.reminders.spendingAlerts,
    quietHoursEnabled: preferences.notifications.quietHours?.enabled,
  };

  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
