/**
 * Local JWT authentication fallback provider.
 * Replaces AWS Cognito when running locally or when Cognito is unavailable.
 *
 * Requirements: 14.2, 15.1, 15.2
 * - Provides equivalent token validation and user identity behavior as Cognito
 * - Authenticates users before granting access to the Conversational Agent or Preference Graph
 * - Rejects unauthenticated requests with appropriate error responses
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const DEFAULT_SECRET = 'kirana-ai-local-dev-secret';
const ISSUER = 'kirana-ai-local';
const TOKEN_EXPIRY = '24h';

/**
 * Get the JWT secret from environment or use default for local dev.
 */
function getSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_SECRET;
}

/**
 * Generate a local JWT with the same claim structure as Cognito.
 * Claims: sub (userId), iss (issuer), exp (expiration).
 */
export function generateLocalToken(userId: string): string {
  return jwt.sign(
    { sub: userId },
    getSecret(),
    { issuer: ISSUER, expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Validate a local JWT and extract the userId.
 * Returns the userId if valid, null otherwise.
 */
export function validateLocalToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { issuer: ISSUER });
    if (typeof decoded === 'object' && decoded.sub) {
      return { userId: decoded.sub as string };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Express route handler for POST /auth/login.
 * Accepts { userId } in the request body and returns { token }.
 */
export function loginHandler(req: Request, res: Response): void {
  const { userId } = req.body as { userId?: string };

  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const token = generateLocalToken(userId.trim());
  res.status(200).json({ token });
}

/**
 * Express middleware that validates the Authorization header.
 * Attaches userId to req object if valid, returns 401 otherwise.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const result = validateLocalToken(token);

  if (!result) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Attach userId to request for downstream handlers
  (req as Request & { userId: string }).userId = result.userId;
  next();
}
