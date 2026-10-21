import pg from 'pg';
import { getEnv } from './env.js';
import { logger } from '../utils/logger.js';

const env = getEnv();
let poolInstance: pg.Pool | null = null;

export function getDatabase(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new pg.Pool({
      connectionString: env.DATABASE_URL,
      // node-postgres defaults to max: 10, which is fine for a couple of
      // users but becomes a real queueing bottleneck ("engasga") as more
      // people message concurrently, since each message does several
      // sequential queries. connectionTimeoutMillis makes that failure
      // mode fast and visible instead of a request just hanging forever
      // when the pool is exhausted.
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
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
