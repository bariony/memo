import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnv } from '../../src/config/env';

describe('Environment validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env to test values
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.REDIS_URL = 'redis://test';
    process.env.CLAUDE_API_KEY = 'sk-test';
    process.env.EVOLUTION_INSTANCE = 'instance';
    process.env.EVOLUTION_API_KEY = 'key';
    process.env.ADMIN_PASSWORD = 'pass';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow('DATABASE_URL is required');
  });

  it('should throw if CLAUDE_API_KEY is missing', () => {
    delete process.env.CLAUDE_API_KEY;
    expect(() => getEnv()).toThrow('CLAUDE_API_KEY is required');
  });

  it('should return valid config when all vars are set', () => {
    const env = getEnv();
    expect(env.DATABASE_URL).toBe('postgresql://test');
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });
});
