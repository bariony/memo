import { createClient, RedisClient } from 'redis';
import { getEnv } from './env';

const env = getEnv();
let clientInstance: RedisClient | null = null;

export async function getRedis(): Promise<RedisClient> {
  if (!clientInstance) {
    clientInstance = createClient({
      url: env.REDIS_URL
    });

    clientInstance.on('error', (err) => console.log('Redis Client Error', err));
    await clientInstance.connect();
  }

  return clientInstance;
}

export async function closeRedis(): Promise<void> {
  if (clientInstance) {
    await clientInstance.quit();
    clientInstance = null;
  }
}
