/**
 * User Preferences Configuration
 * Stores personalized settings for each user
 */

export interface UserPreferences {
  phoneNumber: string;

  // Daily summary settings
  dailySummary: {
    enabled: boolean;
    time: string; // "HH:MM" format (e.g., "08:00")
    timezone?: string; // e.g., "America/Sao_Paulo"
  };

  // Budget settings
  dailyBudget?: number; // Max amount user can spend per day in R$
  currency: string; // "BRL", "USD", etc

  // Reminder settings
  reminders: {
    renewalAlerts: boolean; // 7, 2, 1 day before expiry
    taskReminders: boolean; // Notify about tasks
    spendingAlerts: boolean; // Notify when approaching budget
  };

  // Notification preferences
  notifications: {
    quietHours?: {
      enabled: boolean;
      start: string; // "HH:MM"
      end: string; // "HH:MM"
    };
    vibrateOnAlert: boolean;
    soundOnAlert: boolean;
  };

  // Privacy settings
  privacy: {
    shareStats: boolean; // Allow anonymous stats
    trackingEnabled: boolean;
  };

  createdAt: string;
  updatedAt: string;
}

/**
 * Default preferences for new users
 */
export function getDefaultPreferences(phoneNumber: string): UserPreferences {
  return {
    phoneNumber,
    dailySummary: {
      enabled: true,
      time: '08:00', // 8 AM by default
      timezone: 'America/Sao_Paulo',
    },
    dailyBudget: undefined, // No limit by default
    currency: 'BRL',
    reminders: {
      renewalAlerts: true,
      taskReminders: true,
      spendingAlerts: true,
    },
    notifications: {
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
      },
      vibrateOnAlert: true,
      soundOnAlert: true,
    },
    privacy: {
      shareStats: false,
      trackingEnabled: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validate preferences before saving
 */
export function validatePreferences(prefs: Partial<UserPreferences>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate time format HH:MM
  if (prefs.dailySummary?.time) {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(prefs.dailySummary.time)) {
      errors.push('Daily summary time must be in HH:MM format');
    }
    const [hours, minutes] = prefs.dailySummary.time.split(':').map(Number);
    if (hours > 23 || minutes > 59) {
      errors.push('Invalid time values');
    }
  }

  // Validate daily budget
  if (prefs.dailyBudget !== undefined && prefs.dailyBudget < 0) {
    errors.push('Daily budget must be positive');
  }

  // Validate quiet hours
  if (prefs.notifications?.quietHours?.enabled) {
    const { start, end } = prefs.notifications.quietHours;
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      errors.push('Quiet hours must be in HH:MM format');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
