import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExpenseService } from '../../src/services/expense.service';
import { getDatabase } from '../../src/config/database';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let pool: any;
  const testPhone = '11999999999';

  beforeAll(async () => {
    pool = getDatabase();
    service = new ExpenseService();
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM expenses WHERE phone_number = $1', [testPhone]);
      await pool.query('DELETE FROM users WHERE phone_number = $1', [testPhone]);
    } catch (e) {
      // Table might not exist yet
    }
    await pool.end();
  });

  it('should log an expense', async () => {
    // Create user first
    await pool.query(
      'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
      [testPhone]
    );

    const expense = await service.logExpense(testPhone, 50, 'mercado');
    expect(expense.amount).toBe(50);
    expect(expense.description).toBe('mercado');
    expect(expense.id).toBeDefined();
  });

  it('should retrieve recent expenses (last 7 days)', async () => {
    const expenses = await service.getRecentExpenses(testPhone, 7);
    expect(Array.isArray(expenses)).toBe(true);
    expect(expenses.length).toBeGreaterThan(0);
  });
});
