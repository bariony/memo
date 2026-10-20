import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, LogLevel } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  metadata?: Record<string, any>;
  requestId?: string;
}

export interface LogsQueryOptions {
  level?: LogLevel;
  limit?: number;
  offset?: number;
  hours?: number;
  search?: string;
  context?: string;
}

export interface LogsResponse {
  success: boolean;
  logs: LogEntry[];
  total: number;
  filtered: number;
  options: LogsQueryOptions;
  timestamp: string;
}

class LogsService {
  private getAllLogFiles(): string[] {
    try {
      if (!fs.existsSync(logsDir)) {
        return [];
      }

      return fs
        .readdirSync(logsDir)
        .filter((file) => file.endsWith('.log'))
        .sort()
        .reverse(); // Most recent first
    } catch (err) {
      logger.error('Error reading logs directory', err, 'LogsService');
      return [];
    }
  }

  private readLogFile(filename: string): LogEntry[] {
    try {
      const filepath = path.join(logsDir, filename);
      const content = fs.readFileSync(filepath, 'utf-8');

      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as LogEntry;
          } catch (err) {
            // Skip malformed lines
            return null;
          }
        })
        .filter((entry): entry is LogEntry => entry !== null);
    } catch (err) {
      logger.error(`Error reading log file: ${filename}`, err, 'LogsService');
      return [];
    }
  }

  getLogs(options: LogsQueryOptions = {}): LogsResponse {
    const {
      level,
      limit = 100,
      offset = 0,
      hours = 24,
      search,
      context,
    } = options;

    // Calculate time threshold
    const now = new Date();
    const threshold = new Date(now.getTime() - (hours * 60 * 60 * 1000));

    // Read all log files
    const files = this.getAllLogFiles();
    let allLogs: LogEntry[] = [];

    for (const file of files) {
      const logs = this.readLogFile(file);
      allLogs = allLogs.concat(logs);

      // Stop if we have enough logs
      if (allLogs.length > limit * 10) break;
    }

    // Sort by timestamp (most recent first)
    allLogs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Filter logs
    let filtered = allLogs.filter((log) => {
      const logTime = new Date(log.timestamp);

      // Time filter
      if (logTime < threshold) {
        return false;
      }

      // Level filter
      if (level && log.level !== level) {
        return false;
      }

      // Context filter
      if (context && log.context !== context) {
        return false;
      }

      // Search filter (searches in message, error, context)
      if (search) {
        const searchLower = search.toLowerCase();
        const matches =
          log.message.toLowerCase().includes(searchLower) ||
          log.error?.toLowerCase().includes(searchLower) ||
          log.context?.toLowerCase().includes(searchLower) ||
          log.requestId?.toLowerCase().includes(searchLower);

        if (!matches) return false;
      }

      return true;
    });

    const total = allLogs.length;
    const filteredCount = filtered.length;

    // Pagination
    const paginatedLogs = filtered.slice(offset, offset + limit);

    return {
      success: true,
      logs: paginatedLogs,
      total,
      filtered: filteredCount,
      options: {
        level,
        limit,
        offset,
        hours,
        search,
        context,
      },
      timestamp: new Date().toISOString(),
    };
  }

  getLogLevels(): LogLevel[] {
    return [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  }

  getLogContexts(): string[] {
    const files = this.getAllLogFiles();
    const contexts = new Set<string>();

    for (const file of files) {
      const logs = this.readLogFile(file);
      logs.forEach((log) => {
        if (log.context) {
          contexts.add(log.context);
        }
      });

      if (contexts.size > 50) break; // Limit to prevent slowdown
    }

    return Array.from(contexts).sort();
  }

  getLogStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    lastError?: LogEntry;
  } {
    const files = this.getAllLogFiles();
    let allLogs: LogEntry[] = [];

    for (const file of files) {
      const logs = this.readLogFile(file);
      allLogs = allLogs.concat(logs);

      if (allLogs.length > 10000) break; // Limit for performance
    }

    const stats = {
      total: allLogs.length,
      byLevel: {
        [LogLevel.ERROR]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.DEBUG]: 0,
      },
      lastError: undefined as LogEntry | undefined,
    };

    allLogs.forEach((log) => {
      stats.byLevel[log.level]++;

      if (log.level === LogLevel.ERROR && !stats.lastError) {
        stats.lastError = log;
      }
    });

    return stats;
  }

  clearOldLogs(daysToKeep: number = 30): number {
    try {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - daysToKeep);

      const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('.log'));
      let deletedCount = 0;

      files.forEach((file) => {
        const filepath = path.join(logsDir, file);
        const stat = fs.statSync(filepath);

        if (stat.mtime < threshold) {
          fs.unlinkSync(filepath);
          deletedCount++;
          logger.info(`Deleted old log file: ${file}`, 'LogsService');
        }
      });

      return deletedCount;
    } catch (err) {
      logger.error('Error clearing old logs', err, 'LogsService');
      return 0;
    }
  }
}

export const logsService = new LogsService();
