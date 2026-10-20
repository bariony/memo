export enum ErrorCode {
  // Auth errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',

  // Rate limit
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // Business logic errors
  USER_DISABLED = 'USER_DISABLED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
}

interface ErrorDetails {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: string;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: string;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: Record<string, any>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// Factory functions for common errors
export const errors = {
  // Auth
  invalidCredentials: (message = 'Invalid credentials') =>
    new AppError(ErrorCode.INVALID_CREDENTIALS, message, 401),

  unauthorized: (message = 'Unauthorized') =>
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),

  forbidden: (message = 'Forbidden') =>
    new AppError(ErrorCode.FORBIDDEN, message, 403),

  tokenExpired: (message = 'Token expired') =>
    new AppError(ErrorCode.TOKEN_EXPIRED, message, 401),

  // Validation
  validationError: (message = 'Validation error', details?: Record<string, any>) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  invalidInput: (field: string, message?: string) =>
    new AppError(
      ErrorCode.INVALID_INPUT,
      message || `Invalid input for field: ${field}`,
      400,
      { field }
    ),

  // Resource
  notFound: (resource: string, id?: string | number) =>
    new AppError(
      ErrorCode.NOT_FOUND,
      `${resource} not found${id ? ` (${id})` : ''}`,
      404,
      { resource, id }
    ),

  alreadyExists: (resource: string, field?: string, value?: any) =>
    new AppError(
      ErrorCode.ALREADY_EXISTS,
      `${resource} already exists${field ? ` with ${field}` : ''}`,
      409,
      { resource, field, value }
    ),

  conflict: (message: string, details?: Record<string, any>) =>
    new AppError(ErrorCode.CONFLICT, message, 409, details),

  // Rate limit
  rateLimitExceeded: (message = 'Too many requests. Please try again later.') =>
    new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429),

  // Server
  internalError: (message = 'Internal server error', details?: Record<string, any>) =>
    new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500, details),

  serviceUnavailable: (service: string) =>
    new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      `${service} service is temporarily unavailable`,
      503,
      { service }
    ),

  externalServiceError: (service: string, error?: string) =>
    new AppError(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `Error communicating with ${service}`,
      502,
      { service, originalError: error }
    ),

  // Business logic
  userDisabled: (userId?: string) =>
    new AppError(
      ErrorCode.USER_DISABLED,
      'User account is disabled or access expired',
      403,
      { userId }
    ),

  permissionDenied: (action: string, resource?: string) =>
    new AppError(
      ErrorCode.PERMISSION_DENIED,
      `Permission denied for action: ${action}`,
      403,
      { action, resource }
    ),

  quotaExceeded: (quotaType: string, limit?: number) =>
    new AppError(
      ErrorCode.QUOTA_EXCEEDED,
      `${quotaType} quota exceeded${limit ? ` (limit: ${limit})` : ''}`,
      429,
      { quotaType, limit }
    ),
};
