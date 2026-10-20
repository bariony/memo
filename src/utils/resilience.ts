import { logger } from './logger.js';
import { errors } from './errors.js';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

/**
 * Alert types for different scenarios
 */
export enum AlertType {
  // User behavior
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SPAM_DETECTED = 'SPAM_DETECTED',
  INVALID_REQUESTS = 'INVALID_REQUESTS',

  // System health
  API_TIMEOUT = 'API_TIMEOUT',
  API_ERROR = 'API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_DOWN = 'EXTERNAL_SERVICE_DOWN',

  // Unusual activity
  BURST_REQUESTS = 'BURST_REQUESTS',
  UNUSUAL_PATTERN = 'UNUSUAL_PATTERN',
  MEMORY_PRESSURE = 'MEMORY_PRESSURE',

  // Bot behavior
  BOT_UNRESPONSIVE = 'BOT_UNRESPONSIVE',
  BOT_ERROR = 'BOT_ERROR',
}

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  userId?: string;
  userPhone?: string;
  timestamp: string;
  details?: Record<string, any>;
  resolved?: boolean;
}

/**
 * User rate limiting tracker
 */
class RateLimitTracker {
  private userStats = new Map<
    string,
    {
      count: number;
      window_start: number;
      errors: number;
      last_reset: number;
    }
  >();

  private windowMs = 60 * 1000; // 1 minute
  private maxRequests = 30; // 30 requests per minute
  private maxErrors = 5; // 5 errors per minute

  check(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    let stats = this.userStats.get(userId);

    if (!stats) {
      stats = {
        count: 0,
        window_start: now,
        errors: 0,
        last_reset: now,
      };
      this.userStats.set(userId, stats);
    }

    // Reset if window expired
    if (now - stats.window_start > this.windowMs) {
      stats.count = 0;
      stats.errors = 0;
      stats.window_start = now;
    }

    // Check limits
    if (stats.count >= this.maxRequests) {
      return {
        allowed: false,
        reason: `Too many requests (${this.maxRequests}/min)`,
      };
    }

    if (stats.errors >= this.maxErrors) {
      return {
        allowed: false,
        reason: `Too many errors (${this.maxErrors}/min)`,
      };
    }

    stats.count++;
    return { allowed: true };
  }

  recordError(userId: string): void {
    const stats = this.userStats.get(userId);
    if (stats) {
      stats.errors++;
    }
  }

  getStats(userId: string): any {
    return this.userStats.get(userId) || null;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [userId, stats] of this.userStats.entries()) {
      if (now - stats.last_reset > 5 * 60 * 1000) {
        // Remove inactive users after 5 minutes
        this.userStats.delete(userId);
      }
    }
  }
}

/**
 * Alert aggregator - prevents alert spam
 */
class AlertAggregator {
  private alerts: Alert[] = [];
  private userAlertCounts = new Map<string, number>();
  private maxAlertsPerUser = 10; // Max 10 active alerts per user

  add(alert: Alert): boolean {
    const count = this.userAlertCounts.get(alert.userId || 'system') || 0;

    if (count >= this.maxAlertsPerUser) {
      return false; // Ignore - too many alerts for this user
    }

    this.alerts.push(alert);
    this.userAlertCounts.set(
      alert.userId || 'system',
      count + 1
    );

    logger.warn(
      `ALERT [${alert.severity}] ${alert.type}`,
      'AlertAggregator',
      {
        userId: alert.userId,
        message: alert.message,
        details: alert.details,
      }
    );

    return true;
  }

  getActive(): Alert[] {
    return this.alerts.filter((a) => !a.resolved);
  }

  getForUser(userId: string): Alert[] {
    return this.alerts.filter((a) => a.userId === userId && !a.resolved);
  }

  resolve(alertId: string): void {
    const alert = this.alerts.find((a) => a.timestamp === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  clear(userId?: string): void {
    if (userId) {
      this.alerts = this.alerts.filter((a) => a.userId !== userId);
      this.userAlertCounts.delete(userId);
    } else {
      this.alerts = [];
      this.userAlertCounts.clear();
    }
  }
}

/**
 * Circuit breaker for external services
 */
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  private readonly failureThreshold = 5; // Fail after 5 failures
  private readonly resetTimeout = 60 * 1000; // Try again after 1 minute
  private readonly successThreshold = 2; // Need 2 successes to close

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return false; // Allow one request through
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
      }
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getStatus(): string {
    return this.state;
  }
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      if (attempt < maxAttempts - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Timeout wrapper
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Main resilience manager
 */
class ResilienceManager {
  private rateLimiter = new RateLimitTracker();
  private alertAggregator = new AlertAggregator();
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor() {
    // Cleanup every 5 minutes
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, 5 * 60 * 1000);
  }

  // ════════════════════════════════════════════════════════════════
  // RATE LIMITING
  // ════════════════════════════════════════════════════════════════

  checkRateLimit(userId: string): { allowed: boolean; reason?: string } {
    const result = this.rateLimiter.check(userId);

    if (!result.allowed) {
      this.alertAggregator.add({
        type: AlertType.RATE_LIMIT_EXCEEDED,
        severity: AlertSeverity.WARNING,
        message: `User exceeding rate limit: ${result.reason}`,
        userId,
        timestamp: new Date().toISOString(),
        details: this.rateLimiter.getStats(userId),
      });
    }

    return result;
  }

  recordError(userId: string): void {
    this.rateLimiter.recordError(userId);
  }

  // ════════════════════════════════════════════════════════════════
  // ALERTS
  // ════════════════════════════════════════════════════════════════

  createAlert(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    userId?: string,
    details?: Record<string, any>
  ): void {
    this.alertAggregator.add({
      type,
      severity,
      message,
      userId,
      timestamp: new Date().toISOString(),
      details,
    });
  }

  getAlerts(userId?: string): Alert[] {
    return userId
      ? this.alertAggregator.getForUser(userId)
      : this.alertAggregator.getActive();
  }

  resolveAlert(alertId: string): void {
    this.alertAggregator.resolve(alertId);
  }

  clearAlerts(userId?: string): void {
    this.alertAggregator.clear(userId);
  }

  // ════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER
  // ════════════════════════════════════════════════════════════════

  getCircuitBreaker(serviceName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker());
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  isServiceDown(serviceName: string): boolean {
    return this.getCircuitBreaker(serviceName).isOpen();
  }

  recordServiceSuccess(serviceName: string): void {
    this.getCircuitBreaker(serviceName).recordSuccess();
  }

  recordServiceFailure(serviceName: string): void {
    this.getCircuitBreaker(serviceName).recordFailure();

    this.createAlert(
      AlertType.API_ERROR,
      AlertSeverity.ERROR,
      `Service failure: ${serviceName}`,
      undefined,
      { service: serviceName }
    );
  }

  // ════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ════════════════════════════════════════════════════════════════

  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    alerts: number;
    services: Record<string, string>;
  } {
    const alerts = this.getAlerts();
    const criticalAlerts = alerts.filter((a) => a.severity === AlertSeverity.CRITICAL);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (criticalAlerts.length > 0) status = 'unhealthy';
    else if (alerts.length > 5) status = 'degraded';

    const services: Record<string, string> = {};
    this.circuitBreakers.forEach((breaker, name) => {
      services[name] = breaker.getStatus();
    });

    return { status, alerts: alerts.length, services };
  }
}

export const resilience = new ResilienceManager();
