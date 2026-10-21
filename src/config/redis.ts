import { createClient } from 'redis';
import type { RedisOptions } from 'ioredis';
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

/**
 * Connection options for BullMQ (ioredis-based), parsed from the same
 * REDIS_URL. BullMQ cannot share the `redis` package client above - it
 * needs ioredis - and previously every Queue/Worker in this codebase
 * hardcoded { host: 'localhost', port: 6379 }, which doesn't exist on
 * Railway (the real Redis is a separate managed host via REDIS_URL).
 * That caused every queue/worker to silently fail to connect in production.
 */
export function getBullMQConnection(): RedisOptions {
  const url = new URL(env.REDIS_URL || 'redis://localhost:6379');

  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
