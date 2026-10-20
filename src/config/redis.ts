import { createClient } from 'redis';
import { getEnv } from './env.js';
import { logger } from '../utils/logger.js';

const env = getEnv();

export const redis = createClient({
  url: env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err: any) => {
  logger.error('Redis Client Error', err, 'Redis');
});

redis.on('connect', () => {
  logger.info('✓ Redis connected', 'Redis');
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}
