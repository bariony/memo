export interface Config {
  DATABASE_URL: string;
  REDIS_URL: string;
  CLAUDE_API_KEY: string;
  EVOLUTION_INSTANCE: string;
  EVOLUTION_API_KEY: string;
  ADMIN_PASSWORD: string;
  ADMIN_PHONE_NUMBER: string;
  JWT_SECRET: string;
  MONITOR_API_KEY: string;
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
    // Was previously ADMIN_PASSWORD reused as the JWT signing key, mixing a
    // login secret with a cryptographic one. Falls back to ADMIN_PASSWORD
    // so existing deployments keep working without a Railway env change,
    // but a dedicated JWT_SECRET should be set for real security.
    JWT_SECRET: process.env.JWT_SECRET || process.env.ADMIN_PASSWORD!,
    // Separate from ADMIN_PASSWORD/JWT_SECRET on purpose: this is handed to
    // an external monitoring agent that only needs read-only visibility
    // into recent errors/delivery failures, not full admin control. No
    // weak fallback here - if unset, the health-report route refuses
    // every request instead of silently working with a guessable default.
    MONITOR_API_KEY: process.env.MONITOR_API_KEY || '',
    NODE_ENV: (process.env.NODE_ENV || 'development') as any,
    PORT: parseInt(process.env.PORT || '3000', 10)
  };
}
