import { z, ZodSchema, ZodError } from 'zod';

// Reusable schemas
export const schemas = {
  // Auth
  password: z.string().min(6).max(256),
  token: z.string().min(10),

  // Phone
  phoneNumber: z.string()
    .regex(/^\d{11}$/, 'Invalid phone number (must be 11 digits)')
    .refine(
      (phone) => {
        const ddd = parseInt(phone.substring(0, 2));
        if (ddd < 11 || ddd > 99) return false;
        const firstDigitAfterDDD = phone[2];
        if (firstDigitAfterDDD !== '9') return false;
        return true;
      },
      'Invalid phone number format'
    ),

  // Date
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  futureDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .refine(
      (date) => new Date(date) > new Date(),
      'Date must be in the future'
    ),

  // IDs
  uuid: z.string().uuid(),
  numberId: z.number().positive(),

  // API
  days: z.number().int().min(1).max(365),
};

// Request body schemas
export const requestSchemas = {
  // Admin auth
  adminLogin: z.object({
    password: schemas.password,
  }),

  // Whitelist management
  addUser: z.object({
    phone_number: schemas.phoneNumber,
    permitted_until: schemas.futureDate,
  }),

  updateUser: z.object({
    permitted_until: schemas.futureDate,
  }),

  // Analytics
  analyticsQuery: z.object({
    days: schemas.days.optional().default(7),
  }),
};

export type AddUserRequest = z.infer<typeof requestSchemas.addUser>;
export type UpdateUserRequest = z.infer<typeof requestSchemas.updateUser>;
export type AdminLoginRequest = z.infer<typeof requestSchemas.adminLogin>;

export class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super('Validation error');
    this.name = 'ValidationError';
  }
}

export function validate<T>(schema: ZodSchema, data: unknown): T {
  try {
    return schema.parse(data) as T;
  } catch (error) {
    if (error instanceof ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      throw new ValidationError(errors);
    }
    throw error;
  }
}

// Middleware for validating request bodies
export function validateRequest(schema: ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      req.validated = validate(schema, req.body);
      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  };
}
