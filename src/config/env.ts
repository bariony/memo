export interface Config {
  DATABASE_URL: string;
  REDIS_URL: string;
  CLAUDE_API_KEY: string;
  EVOLUTION_INSTANCE: string;
  EVOLUTION_API_KEY: string;
  ADMIN_PASSWORD: string;
  ADMIN_PHONE_NUMBER: string;
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
}

export function getEnv(): Config {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'CLAUDE_API_KEY',
    'EVOLUTION_INSTANCE',
    'EVOLUTION_API_KEY',
    'ADMIN_PASSWORD'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required`);
    }
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: process.env.REDIS_URL!,
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY!,
    EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE!,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY!,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD!,
    // Not in `required`: this already had a working default (the number
    // used in every static "fale com o administrador" message), so adding
    // the access-request feature shouldn't force a Railway env var change
    // before it can deploy.
    ADMIN_PHONE_NUMBER: process.env.ADMIN_PHONE_NUMBER || '11986683737',
    NODE_ENV: (process.env.NODE_ENV || 'development') as any,
    PORT: parseInt(process.env.PORT || '3000', 10)
  };
}
