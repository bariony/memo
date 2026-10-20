import { Request, Response, NextFunction } from 'express';
import { AppError, errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface RequestWithId extends Request {
  id?: string;
}

export function errorHandler(
  err: Error | AppError,
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  const requestId = req.id || 'unknown';

  // Handle AppError
  if (err instanceof AppError) {
    logger.warn(
      `Client error: ${err.code}`,
      'ErrorHandler',
      { code: err.code, message: err.message },
      requestId
    );

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
      timestamp: err.timestamp,
      requestId,
    });
  }

  // Handle unexpected errors
  logger.error(
    `Unhandled error: ${err.message}`,
    err,
    'ErrorHandler',
    { stack: err.stack },
    requestId
  );

  // Don't expose internal error details to client
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isDevelopment ? err.message : 'Internal server error',
      ...(isDevelopment && { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
    requestId,
  });
}

// Wrapper to handle async route errors
export function asyncHandler(fn: (req: RequestWithId, res: Response, next: NextFunction) => Promise<any>) {
  return (req: RequestWithId, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler
export function notFoundHandler(req: RequestWithId, res: Response) {
  const error = errors.notFound('Route', req.path);
  logger.warn(`Not found: ${req.method} ${req.path}`, 'NotFound', undefined, req.id);

  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
    timestamp: error.timestamp,
    requestId: req.id,
  });
}
