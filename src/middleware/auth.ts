import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';

const env = getEnv();

export interface TokenPayload {
  admin: boolean;
}

export function generateAdminToken(): string {
  return jwt.sign({ admin: true }, env.JWT_SECRET, { expiresIn: '24h' });
}

export function verifyAdminToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  try {
    const token = authHeader.substring(7);
    verifyAdminToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Alias for compatibility
export const authMiddleware = requireAuth;
