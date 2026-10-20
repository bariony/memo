import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  stack?: string;
  metadata?: Record<string, any>;
  requestId?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV !== 'production';

  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private writeToFile(entry: LogEntry): void {
    const filename = `${entry.level.toLowerCase()}-${new Date().toISOString().split('T')[0]}.log`;
    const filepath = path.join(logsDir, filename);
    const line = this.formatLog(entry) + '\n';

    fs.appendFileSync(filepath, line, 'utf-8');
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    error?: Error | string,
    metadata?: Record<string, any>,
    requestId?: string
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      requestId,
    };

    if (error) {
      if (error instanceof Error) {
        entry.error = error.message;
        entry.stack = error.stack;
      } else {
        entry.error = String(error);
      }
    }

    if (metadata) {
      entry.metadata = metadata;
    }

    // Console output (prettier for development)
    if (this.isDevelopment) {
      const colors = {
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.WARN]: '\x1b[33m', // Yellow
        [LogLevel.INFO]: '\x1b[32m', // Green
        [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      };
      const reset = '\x1b[0m';
      const color = colors[level];

      let output = `${color}[${entry.timestamp}] ${level}${reset}`;
      if (context) output += ` [${context}]`;
      output += `: ${message}`;
      if (metadata) output += ` ${JSON.stringify(metadata)}`;
      if (error) output += ` | ${error}`;

      console.log(output);
    }

    // File output (always)
    this.writeToFile(entry);
  }

  error(message: string, error?: Error | string, context?: string, metadata?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.ERROR, message, context, error, metadata, requestId);
  }

  warn(message: string, context?: string, metadata?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata, requestId);
  }

  info(message: string, context?: string, metadata?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata, requestId);
  }

  debug(message: string, context?: string, metadata?: Record<string, any>, requestId?: string): void {
    if (!this.isDevelopment) return;
    this.log(LogLevel.DEBUG, message, context, undefined, metadata, requestId);
  }
}

export const logger = new Logger();
