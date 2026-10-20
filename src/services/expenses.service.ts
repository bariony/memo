import { logger } from '../utils/logger.js';
import { Expense, DailyExpenseSummary, PeriodSummary } from '../config/expenses.js';

/**
 * Mock in-memory expense storage
 * TODO: Replace with database queries
 */
const expenseStore: Map<string, Expense[]> = new Map();

/**
 * Register a new expense for user
 */
export async function registerExpense(
  phoneNumber: string,
  amount: number,
  description: string,
  category?: string
): Promise<Expense> {
  const expense: Expense = {
    id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    phoneNumber,
    amount,
    description,
    category: category || 'Outros',
    date: new Date(),
    createdAt: new Date(),
  };

  if (!expenseStore.has(phoneNumber)) {
    expenseStore.set(phoneNumber, []);
  }

  expenseStore.get(phoneNumber)!.push(expense);

  logger.info('Expense registered', 'ExpensesService', {
    phoneNumber,
    amount,
    category: expense.category,
  });

  return expense;
}

/**
 * Get expenses for today
 */
export async function getTodayExpenses(phoneNumber: string): Promise<DailyExpenseSummary> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const expenses = expenseStore.get(phoneNumber) || [];
  const todayExpenses = expenses.filter(
    (exp) => exp.date >= today && exp.date < tomorrow
  );

  const total = todayExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return {
    date: today.toISOString().split('T')[0],
    total: parseFloat(total.toFixed(2)),
    count: todayExpenses.length,
    expenses: todayExpenses,
  };
}

/**
 * Get expenses for a specific date
 */
export async function getExpensesByDate(
  phoneNumber: string,
  date: Date
): Promise<DailyExpenseSummary> {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const expenses = expenseStore.get(phoneNumber) || [];
  const dayExpenses = expenses.filter(
    (exp) => exp.date >= startDate && exp.date < endDate
  );

  const total = dayExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return {
    date: startDate.toISOString().split('T')[0],
    total: parseFloat(total.toFixed(2)),
    count: dayExpenses.length,
    expenses: dayExpenses,
  };
}

/**
 * Get week summary (last 7 days)
 */
export async function getWeekSummary(phoneNumber: string): Promise<PeriodSummary> {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const expenses = expenseStore.get(phoneNumber) || [];
  const weekExpenses = expenses.filter(
    (exp) => exp.date >= weekAgo && exp.date <= today
  );

  const total = weekExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const average = weekExpenses.length > 0 ? total / 7 : 0;

  // Group by category
  const byCategory: Record<string, number> = {};
  weekExpenses.forEach((exp) => {
    byCategory[exp.category || 'Outros'] =
      (byCategory[exp.category || 'Outros'] || 0) + exp.amount;
  });

  return {
    period: 'week',
    startDate: weekAgo,
    endDate: today,
    total: parseFloat(total.toFixed(2)),
    count: weekExpenses.length,
    average: parseFloat(average.toFixed(2)),
    byCategory,
  };
}

/**
 * Get month summary (current month)
 */
export async function getMonthSummary(phoneNumber: string): Promise<PeriodSummary> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const expenses = expenseStore.get(phoneNumber) || [];
  const monthExpenses = expenses.filter(
    (exp) => exp.date >= monthStart && exp.date <= monthEnd
  );

  const total = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const average = monthExpenses.length > 0 ? total / getDaysInMonth(today) : 0;

  // Group by category
  const byCategory: Record<string, number> = {};
  monthExpenses.forEach((exp) => {
    byCategory[exp.category || 'Outros'] =
      (byCategory[exp.category || 'Outros'] || 0) + exp.amount;
  });

  return {
    period: 'month',
    startDate: monthStart,
    endDate: monthEnd,
    total: parseFloat(total.toFixed(2)),
    count: monthExpenses.length,
    average: parseFloat(average.toFixed(2)),
    byCategory,
  };
}

/**
 * Check if user exceeded daily budget
 */
export async function checkDailyBudgetExceeded(
  phoneNumber: string,
  dailyBudget?: number
): Promise<{
  exceeded: boolean;
  spent: number;
  budget?: number;
  remaining?: number;
  percentageUsed: number;
}> {
  if (!dailyBudget) {
    return {
      exceeded: false,
      spent: 0,
      percentageUsed: 0,
    };
  }

  const today = await getTodayExpenses(phoneNumber);
  const percentageUsed = (today.total / dailyBudget) * 100;

  return {
    exceeded: today.total > dailyBudget,
    spent: today.total,
    budget: dailyBudget,
    remaining: Math.max(0, dailyBudget - today.total),
    percentageUsed: parseFloat(percentageUsed.toFixed(1)),
  };
}

/**
 * Get all expenses for a user (paginated)
 */
export async function getUserExpenses(
  phoneNumber: string,
  limit: number = 50,
  offset: number = 0
): Promise<{
  expenses: Expense[];
  total: number;
  limit: number;
  offset: number;
}> {
  const expenses = expenseStore.get(phoneNumber) || [];
  const sorted = expenses.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    expenses: sorted.slice(offset, offset + limit),
    total: sorted.length,
    limit,
    offset,
  };
}

/**
 * Delete an expense
 */
export async function deleteExpense(phoneNumber: string, expenseId: string): Promise<boolean> {
  const expenses = expenseStore.get(phoneNumber);
  if (!expenses) return false;

  const index = expenses.findIndex((exp) => exp.id === expenseId);
  if (index === -1) return false;

  expenses.splice(index, 1);

  logger.info('Expense deleted', 'ExpensesService', {
    phoneNumber,
    expenseId,
  });

  return true;
}

/**
 * Helper: get days in month
 */
function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Get top categories by spending
 */
export async function getTopCategories(
  phoneNumber: string,
  limit: number = 5
): Promise<Array<{ category: string; total: number; percentage: number }>> {
  const expenses = expenseStore.get(phoneNumber) || [];
  const byCategory: Record<string, number> = {};

  expenses.forEach((exp) => {
    const cat = exp.category || 'Outros';
    byCategory[cat] = (byCategory[cat] || 0) + exp.amount;
  });

  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);

  return Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([category, amount]) => ({
      category,
      total: parseFloat(amount.toFixed(2)),
      percentage: parseFloat(((amount / total) * 100).toFixed(1)),
    }));
}

export const expensesService = {
  registerExpense,
  getTodayExpenses,
  getExpensesByDate,
  getWeekSummary,
  getMonthSummary,
  checkDailyBudgetExceeded,
  getUserExpenses,
  deleteExpense,
  getTopCategories,
};
