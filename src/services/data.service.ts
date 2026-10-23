import { getDatabase } from '../config/database.js';

export interface Range { from: Date; to: Date }

/** São Paulo is a fixed UTC-3: converts YYYY-MM-DD (local) to the [from, to) UTC range covering those local days. */
export function localRange(fromDate: string, toDate?: string): Range | null {
  const from = new Date(`${fromDate}T00:00:00-03:00`);
  const end = new Date(`${toDate || fromDate}T00:00:00-03:00`);
  if (isNaN(from.getTime()) || isNaN(end.getTime())) return null;
  return { from, to: new Date(end.getTime() + 24 * 3600e3) };
}

export class DataService {
  // ---- expenses ----
  async logExpense(phone: string, amount: number, description: string, category: string | null, when?: Date) {
    const r = await getDatabase().query(
      'INSERT INTO expenses (phone_number, amount, description, category, created_at) VALUES ($1,$2,$3,$4,COALESCE($5, NOW())) RETURNING id',
      [phone, amount, description, category, when ?? null]
    );
    return r.rows[0].id as string;
  }

  async listExpenses(phone: string, range: Range) {
    const r = await getDatabase().query(
      'SELECT id, amount, description, category, created_at FROM expenses WHERE phone_number=$1 AND created_at>=$2 AND created_at<$3 ORDER BY created_at ASC',
      [phone, range.from, range.to]
    );
    return r.rows as { id: string; amount: string; description: string; category: string | null; created_at: Date }[];
  }

  async updateExpense(phone: string, id: string, fields: { amount?: number; description?: string; category?: string }) {
    const r = await getDatabase().query(
      'UPDATE expenses SET amount=COALESCE($3,amount), description=COALESCE($4,description), category=COALESCE($5,category) WHERE id=$1 AND phone_number=$2',
      [id, phone, fields.amount ?? null, fields.description ?? null, fields.category ?? null]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async deleteExpense(phone: string, id: string) {
    const r = await getDatabase().query('DELETE FROM expenses WHERE id=$1 AND phone_number=$2', [id, phone]);
    return (r.rowCount ?? 0) > 0;
  }

  // ---- notes ----
  async saveNote(phone: string, text: string, when?: Date) {
    const r = await getDatabase().query(
      'INSERT INTO notes (phone_number, text, occurred_at) VALUES ($1,$2,COALESCE($3, NOW())) RETURNING id',
      [phone, text, when ?? null]
    );
    return r.rows[0].id as string;
  }

  async listNotes(phone: string, range: Range, query?: string) {
    const r = await getDatabase().query(
      'SELECT id, text, occurred_at FROM notes WHERE phone_number=$1 AND occurred_at>=$2 AND occurred_at<$3 AND ($4::text IS NULL OR text ILIKE $4) ORDER BY occurred_at ASC',
      [phone, range.from, range.to, query ? `%${query}%` : null]
    );
    return r.rows as { id: string; text: string; occurred_at: Date }[];
  }

  async deleteNote(phone: string, id: string) {
    const r = await getDatabase().query('DELETE FROM notes WHERE id=$1 AND phone_number=$2', [id, phone]);
    return (r.rowCount ?? 0) > 0;
  }

  // ---- reset ----
  async reset(phone: string, scope: 'expenses' | 'reminders' | 'notes' | 'all') {
    const pool = getDatabase();
    const counts: Record<string, number> = {};
    for (const [key, table] of [['expenses', 'expenses'], ['reminders', 'reminders'], ['notes', 'notes']] as const) {
      if (scope === 'all' || scope === key) {
        const r = await pool.query(`DELETE FROM ${table} WHERE phone_number=$1`, [phone]);
        counts[key] = r.rowCount ?? 0;
      }
    }
    return counts;
  }
}
