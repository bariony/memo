/**
 * Expense tracking configuration and types
 */

export interface Expense {
  id: string;
  phoneNumber: string;
  amount: number;
  description: string;
  category?: string;
  date: Date;
  createdAt: Date;
}

export interface DailyExpenseSummary {
  date: string; // YYYY-MM-DD
  total: number;
  count: number;
  budget?: number;
  remaining?: number;
  percentageUsed?: number;
  expenses: Expense[];
}

export interface PeriodSummary {
  period: 'today' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  total: number;
  count: number;
  average: number;
  byCategory?: Record<string, number>;
}

export const EXPENSE_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Saúde',
  'Compras',
  'Lazer',
  'Contas',
  'Trabalho',
  'Educação',
  'Outros',
];

export function validateExpense(amount: number, description: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (amount <= 0) {
    errors.push('Valor deve ser maior que zero');
  }

  if (amount > 999999.99) {
    errors.push('Valor muito alto (máximo R$ 999.999,99)');
  }

  if (!description || description.trim().length === 0) {
    errors.push('Descrição é obrigatória');
  }

  if (description.length > 200) {
    errors.push('Descrição muito longa (máximo 200 caracteres)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
