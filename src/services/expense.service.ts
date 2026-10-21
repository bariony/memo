import { getDatabase } from '../config/database.js';
import { Expense } from '../types/index.js';

export class ExpenseService {
  async logExpense(phone: string, amount: number, description: string): Promise<Expense> {
    const pool = getDatabase();

    const result = await pool.query(
      'INSERT INTO expenses (phone_number, amount, description) VALUES ($1, $2, $3) RETURNING id, phone_number, amount, description, category, created_at',
      [phone, amount, description]
    );

    return result.rows[0];
  }

  async getRecentExpenses(phone: string, days: number = 7): Promise<Expense[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT id, phone_number, amount, description, category, created_at FROM expenses WHERE phone_number = $1 AND created_at >= NOW() - INTERVAL \'$2 days\' ORDER BY created_at DESC',
      [phone, days]
    );

    return result.rows;
  }

  async getExpensesBetween(phone: string, from: Date, to: Date): Promise<Expense[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT id, phone_number, amount, description, category, created_at FROM expenses WHERE phone_number = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC',
      [phone, from, to]
    );

    return result.rows;
  }

  async getTodayTotal(phone: string): Promise<{ total: number; count: number }> {
    const pool = getDatabase();
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM expenses
       WHERE phone_number = $1 AND created_at >= CURRENT_DATE`,
      [phone]
    );

    return {
      total: parseFloat(result.rows[0].total),
      count: parseInt(result.rows[0].count)
    };
  }

  async getMonthTotal(phone: string): Promise<{ total: number; count: number }> {
    const pool = getDatabase();
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM expenses
       WHERE phone_number = $1 AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
      [phone]
    );

    return {
      total: parseFloat(result.rows[0].total),
      count: parseInt(result.rows[0].count)
    };
  }
}
