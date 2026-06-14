import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateLocalToken,
  validateLocalToken,
  loginHandler,
  authMiddleware,
} from './auth-local.js';
import type { Request, Response, NextFunction } from 'express';

const DEFAULT_SECRET = 'kirana-ai-local-dev-secret';
const ISSUER = 'kirana-ai-local';

// Helper to create mock Express request/response
function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockResponse(): Response & { statusCode: number; jsonBody: unknown } {
  const res = {
    statusCode: 0,
    jsonBody: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.jsonBody = body;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; jsonBody: unknown };
}

describe('auth-local', () => {
  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('generateLocalToken', () => {
    it('should generate a valid JWT for a userId', () => {
      const token = generateLocalToken('user-123');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include sub claim with userId', () => {
      const token = generateLocalToken('user-456');
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.sub).toBe('user-456');
    });

    it('should include iss claim with local issuer', () => {
      const token = generateLocalToken('user-789');
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.iss).toBe(ISSUER);
    });

    it('should include exp claim', () => {
      const token = generateLocalToken('user-abc');
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.exp).toBeDefined();
      // Token should expire in the future
      expect(decoded.exp! * 1000).toBeGreaterThan(Date.now());
    });

    it('should use custom JWT_SECRET from env', () => {
      process.env.JWT_SECRET = 'custom-secret-key';
      const token = generateLocalToken('user-custom');
      // Token should be verifiable with the custom secret
      const decoded = jwt.verify(token, 'custom-secret-key', { issuer: ISSUER });
      expect((decoded as jwt.JwtPayload).sub).toBe('user-custom');
    });
  });

  describe('validateLocalToken', () => {
    it('should validate a token and return userId', () => {
      const token = generateLocalToken('user-123');
      const result = validateLocalToken(token);
      expect(result).toEqual({ userId: 'user-123' });
    });

    it('should return null for an invalid token', () => {
      const result = validateLocalToken('invalid-token-string');
      expect(result).toBeNull();
    });

    it('should return null for a token with wrong secret', () => {
      const token = jwt.sign({ sub: 'user-123' }, 'wrong-secret', { issuer: ISSUER });
      const result = validateLocalToken(token);
      expect(result).toBeNull();
    });

    it('should return null for a token with wrong issuer', () => {
      const token = jwt.sign({ sub: 'user-123' }, DEFAULT_SECRET, { issuer: 'wrong-issuer' });
      const result = validateLocalToken(token);
      expect(result).toBeNull();
    });

    it('should return null for an expired token', () => {
      const token = jwt.sign({ sub: 'user-123' }, DEFAULT_SECRET, {
        issuer: ISSUER,
        expiresIn: '-1s',
      });
      const result = validateLocalToken(token);
      expect(result).toBeNull();
    });

    it('should return null for a token without sub claim', () => {
      const token = jwt.sign({ name: 'test' }, DEFAULT_SECRET, { issuer: ISSUER });
      const result = validateLocalToken(token);
      expect(result).toBeNull();
    });

    it('should validate with custom JWT_SECRET from env', () => {
      process.env.JWT_SECRET = 'custom-secret-key';
      const token = generateLocalToken('user-env');
      const result = validateLocalToken(token);
      expect(result).toEqual({ userId: 'user-env' });
    });
  });

  describe('loginHandler', () => {
    it('should return a token for valid userId', () => {
      const req = mockRequest({ body: { userId: 'user-login' } });
      const res = mockResponse();

      loginHandler(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toHaveProperty('token');
      // Verify the token is valid
      const result = validateLocalToken((res.jsonBody as { token: string }).token);
      expect(result).toEqual({ userId: 'user-login' });
    });

    it('should return 400 when userId is missing', () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      loginHandler(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: 'userId is required' });
    });

    it('should return 400 when userId is empty string', () => {
      const req = mockRequest({ body: { userId: '' } });
      const res = mockResponse();

      loginHandler(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: 'userId is required' });
    });

    it('should return 400 when userId is whitespace only', () => {
      const req = mockRequest({ body: { userId: '   ' } });
      const res = mockResponse();

      loginHandler(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: 'userId is required' });
    });

    it('should return 400 when userId is not a string', () => {
      const req = mockRequest({ body: { userId: 123 } });
      const res = mockResponse();

      loginHandler(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: 'userId is required' });
    });

    it('should trim whitespace from userId', () => {
      const req = mockRequest({ body: { userId: '  user-trim  ' } });
      const res = mockResponse();

      loginHandler(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const result = validateLocalToken((res.jsonBody as { token: string }).token);
      expect(result).toEqual({ userId: 'user-trim' });
    });
  });

  describe('authMiddleware', () => {
    it('should call next() for valid token', () => {
      const token = generateLocalToken('user-middleware');
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect((req as Request & { userId: string }).userId).toBe('user-middleware');
    });

    it('should return 401 when authorization header is missing', () => {
      const req = mockRequest({ headers: {} });
      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res as unknown as Response, next as NextFunction);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ error: 'Missing or invalid authorization header' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header lacks Bearer prefix', () => {
      const token = generateLocalToken('user-nobearer');
      const req = mockRequest({
        headers: { authorization: token },
      });
      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res as unknown as Response, next as NextFunction);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ error: 'Missing or invalid authorization header' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res as unknown as Response, next as NextFunction);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for expired token', () => {
      const token = jwt.sign({ sub: 'user-expired' }, DEFAULT_SECRET, {
        issuer: ISSUER,
        expiresIn: '-1s',
      });
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res as unknown as Response, next as NextFunction);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
