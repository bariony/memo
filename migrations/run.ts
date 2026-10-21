import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../src/config/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const pool = getDatabase();

  const migrations = ['001_initial_schema.sql', '002_add_indexes.sql', '003_analytics_tables.sql', '004_add_user_name.sql'];

  for (const migration of migrations) {
    const filePath = path.join(__dirname, migration);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await pool.query(sql);
      console.log(`✓ Ran ${migration}`);
    } catch (err) {
      console.error(`✗ Failed ${migration}:`, err);
      process.exit(1);
    }
  }

  await pool.end();
  console.log('All migrations completed');
}

runMigrations().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
