import { createClient } from 'redis';
import { getEnv } from './env';

const env = getEnv();
let clientInstance: any = null;

export async function getRedis(): Promise<any> {
  if (!clientInstance) {
    clientInstance = createClient({
      url: env.REDIS_URL
    });

    clientInstance.on('error', (err: any) => console.log('Redis Client Error', err));
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
