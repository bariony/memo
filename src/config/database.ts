import pg from 'pg';
import { getEnv } from './env.js';
import { logger } from '../utils/logger.js';

const env = getEnv();
let poolInstance: pg.Pool | null = null;

export function getDatabase(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new pg.Pool({
      connectionString: env.DATABASE_URL
    });

    // Without this, an error on an idle client (a dropped connection, a
    // brief network blip) is an unhandled 'error' event - which Node
    // treats as an uncaught exception, and this app's uncaughtException
    // handler calls process.exit(1), taking the whole server down over a
    // transient DB hiccup. Same class of bug already fixed for the Redis
    // connections.
    poolInstance.on('error', (err) => {
      logger.error('Postgres pool error', err, 'Database');
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
