import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { errors } from '../utils/errors.js';
import { validateExpense } from '../config/expenses.js';
import {
  registerExpense,
  getTodayExpenses,
  getExpensesByDate,
  getWeekSummary,
  getMonthSummary,
  checkDailyBudgetExceeded,
  getUserExpenses,
  deleteExpense,
  getTopCategories,
} from '../services/expenses.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/expenses
 * Register a new expense
 */
router.post('/expenses', asyncHandler(async (req: any, res: Response) => {
  const { amount, description, category } = req.body;
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  // Validate
  const validation = validateExpense(amount, description);
  if (!validation.valid) {
    throw errors.validationError('Invalid expense data', { errors: validation.errors });
  }

  if (typeof amount !== 'number') {
    throw errors.invalidInput('amount', 'Must be a number');
  }

  // Register expense
  const expense = await registerExpense(phoneNumber, amount, description, category);

  logger.info(
    'Expense registered via API',
    'ExpensesRoute',
    { phoneNumber, amount, category },
    req.id
  );

  res.json({
    success: true,
    expense,
    message: `Gasto de R$ ${amount.toFixed(2)} registrado!`,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses/today
 * Get today's expenses
 */
router.get('/expenses/today', asyncHandler(async (req: any, res: Response) => {
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const summary = await getTodayExpenses(phoneNumber);

  logger.info('Today expenses retrieved', 'ExpensesRoute', { phoneNumber }, req.id);

  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses/date/:date
 * Get expenses for a specific date (YYYY-MM-DD)
 */
router.get('/expenses/date/:date', asyncHandler(async (req: any, res: Response) => {
  const { date } = req.params;
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw errors.invalidInput('date', 'Must be in YYYY-MM-DD format');
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw errors.invalidInput('date', 'Invalid date');
  }

  const summary = await getExpensesByDate(phoneNumber, parsedDate);

  logger.info(
    'Expenses by date retrieved',
    'ExpensesRoute',
    { phoneNumber, date },
    req.id
  );

  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses/week
 * Get week summary (last 7 days)
 */
router.get('/expenses/week', asyncHandler(async (req: any, res: Response) => {
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const summary = await getWeekSummary(phoneNumber);

  logger.info('Week expenses summary retrieved', 'ExpensesRoute', { phoneNumber }, req.id);

  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses/month
 * Get month summary (current month)
 */
router.get('/expenses/month', asyncHandler(async (req: any, res: Response) => {
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const summary = await getMonthSummary(phoneNumber);

  logger.info('Month expenses summary retrieved', 'ExpensesRoute', { phoneNumber }, req.id);

  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses/budget-check
 * Check if user exceeded daily budget
 */
router.get('/expenses/budget-check', asyncHandler(async (req: any, res: Response) => {
  const { budget } = req.query;
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const dailyBudget = budget ? parseFloat(budget as string) : undefined;

  const check = await checkDailyBudgetExceeded(phoneNumber, dailyBudget);

  logger.info(
    'Budget check performed',
    'ExpensesRoute',
    {
      phoneNumber,
      budget: dailyBudget,
      exceeded: check.exceeded,
    },
    req.id
  );

  res.json({
    success: true,
    check,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses
 * Get all expenses (paginated)
 */
router.get('/expenses', asyncHandler(async (req: any, res: Response) => {
  const phoneNumber = req.userPhone || req.phone_number;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const result = await getUserExpenses(phoneNumber, limit, offset);

  logger.info(
    'User expenses retrieved',
    'ExpensesRoute',
    { phoneNumber, count: result.expenses.length },
    req.id
  );

  res.json({
    success: true,
    ...result,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/expenses/categories/top
 * Get top categories by spending
 */
router.get('/expenses/categories/top', asyncHandler(async (req: any, res: Response) => {
  const phoneNumber = req.userPhone || req.phone_number;
  const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const topCategories = await getTopCategories(phoneNumber, limit);

  logger.info(
    'Top categories retrieved',
    'ExpensesRoute',
    { phoneNumber, categories: topCategories.length },
    req.id
  );

  res.json({
    success: true,
    topCategories,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * DELETE /api/expenses/:expenseId
 * Delete an expense
 */
router.delete('/expenses/:expenseId', asyncHandler(async (req: any, res: Response) => {
  const { expenseId } = req.params;
  const phoneNumber = req.userPhone || req.phone_number;

  if (!phoneNumber) {
    throw errors.unauthorized('User phone not found');
  }

  const deleted = await deleteExpense(phoneNumber, expenseId);

  if (!deleted) {
    throw errors.notFound('Expense not found');
  }

  logger.info(
    'Expense deleted',
    'ExpensesRoute',
    { phoneNumber, expenseId },
    req.id
  );

  res.json({
    success: true,
    message: 'Despesa deletada',
    timestamp: new Date().toISOString(),
  });
}));

export default router;
