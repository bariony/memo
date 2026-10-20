import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export interface RequestWithId extends Request {
  id?: string;
  startTime?: number;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  req.startTime = Date.now();
  next();
}

export function requestLoggerMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
  const requestId = req.id || 'unknown';

  // Log incoming request
  logger.info(
    `${req.method} ${req.path}`,
    'HTTP',
    {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
    requestId
  );

  // Capture response
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let responseBody: any = null;

  res.json = function (data: any) {
    responseBody = data;
    return originalJson(data);
  };

  res.send = function (data: any) {
    responseBody = data;
    return originalSend(data);
  };

  // Log response on finish
  res.on('finish', () => {
    const duration = (req.startTime ? Date.now() - req.startTime : 0);
    const statusCode = res.statusCode;

    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    const metadata = {
      method: req.method,
      path: req.path,
      statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
    };

    if (logLevel === 'error') {
      logger.error(
        `${req.method} ${req.path} - ${statusCode}`,
        undefined,
        'HTTP',
        metadata,
        requestId
      );
    } else if (logLevel === 'warn') {
      logger.warn(
        `${req.method} ${req.path} - ${statusCode}`,
        'HTTP',
        metadata,
        requestId
      );
    } else {
      logger.debug(
        `${req.method} ${req.path} - ${statusCode}`,
        'HTTP',
        metadata,
        requestId
      );
    }
  });

  next();
}

// Log request body (for debugging, be careful with sensitive data)
export function requestBodyLogger(req: RequestWithId, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    // Don't log passwords
    const sanitizedBody = { ...req.body };
    if ('password' in sanitizedBody) {
      sanitizedBody.password = '***';
    }
    if ('token' in sanitizedBody) {
      sanitizedBody.token = '***';
    }

    logger.debug(
      `Request body`,
      'HTTP-Body',
      sanitizedBody,
      req.id
    );
  }

  next();
}
