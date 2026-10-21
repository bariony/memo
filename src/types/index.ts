export interface User {
  phone_number: string;
  name?: string;
  name_requested_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WhitelistEntry {
  phone_number: string;
  permitted_until: Date;
  status: 'active' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

export interface Expense {
  id: string;
  phone_number: string;
  amount: number;
  description: string;
  category?: string;
  created_at: Date;
}

export interface Reminder {
  id: string;
  phone_number: string;
  type: 'one_time' | 'recurring';
  scheduled_for: Date;
  recurrence_rule?: string;
  message: string;
  sent: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ClaudeParseExpense {
  amount: number;
  description: string;
}

export interface ClaudeParseReminder {
  scheduledFor: string; // ISO 8601 datetime
  message: string;
  isRecurring: boolean;
}

export interface MessageIntent {
  intent: 'expense_log' | 'expense_query' | 'general_question' | 'reminder_set' | 'reminder_query';
}

export interface AdminUser {
  token: string;
  expiresAt: Date;
}
