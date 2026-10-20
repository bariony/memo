import pg from 'pg';
import { getEnv } from './env.js';

const env = getEnv();
let poolInstance: pg.Pool | null = null;

export function getDatabase(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new pg.Pool({
      connectionString: env.DATABASE_URL
    });
  }
  return poolInstance;
}

export async function closeDatabase(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
