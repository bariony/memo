import { Request, Response, NextFunction } from 'express';
import { errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  skip?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
}

const stores = new Map<string, RateLimitStore>();

function getKey(req: Request, storeKey: string): string {
  // Use token if available (authenticated user), otherwise use IP
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    return `token:${token}`;
  }
  return `ip:${req.ip}`;
}

export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests',
    skip,
    keyGenerator,
  } = config;

  const storeKey = `${windowMs}-${maxRequests}`;
  if (!stores.has(storeKey)) {
    stores.set(storeKey, {});
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if condition is met
    if (skip && skip(req)) {
      return next();
    }

    const store = stores.get(storeKey)!;
    const key = keyGenerator ? keyGenerator(req) : getKey(req, storeKey);
    const now = Date.now();

    // Get or create entry
    if (!store[key]) {
      store[key] = { count: 0, resetTime: now + windowMs };
    }

    const entry = store[key];

    // Reset if window expired
    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    entry.count++;

    // Set rate limit headers
    const remainingRequests = Math.max(0, maxRequests - entry.count);
    const resetIn = Math.ceil((entry.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remainingRequests.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      const requestId = (req as any).id || 'unknown';
      logger.warn(
        `Rate limit exceeded: ${key}`,
        'RateLimiter',
        { key, requests: entry.count, limit: maxRequests },
        requestId
      );

      const error = errors.rateLimitExceeded(
        `${message}. Retry after ${resetIn} seconds.`
      );

      return res
        .status(error.statusCode)
        .set('Retry-After', resetIn.toString())
        .json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            retryAfter: resetIn,
          },
          timestamp: error.timestamp,
          requestId,
        });
    }

    next();
  };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  stores.forEach((store) => {
    Object.entries(store).forEach(([key, entry]) => {
      if (now > entry.resetTime + 60000) {
        // Keep entries for 1 minute after reset
        delete store[key];
      }
    });
  });
}, 60000);

// Common limiters
export const rateLimiters = {
  // General API limiter: 100 requests per 15 minutes
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    message: 'Too many API requests',
  }),

  // Auth limiter: 5 attempts per 15 minutes
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many authentication attempts',
  }),

  // Webhook limiter: 1000 requests per minute
  webhook: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 1000,
    message: 'Too many webhook requests',
  }),

  // Message limiter: 30 messages per minute
  messages: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many messages',
  }),

  // Admin limiter: 500 requests per minute
  admin: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 500,
    message: 'Too many admin requests',
  }),
};
