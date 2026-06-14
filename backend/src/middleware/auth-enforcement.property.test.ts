/**
 * Property-Based Test: Authentication Enforcement (Property 18)
 *
 * For any request to the Conversational Agent or Preference Graph without a valid
 * authentication token, the system SHALL reject the request with an appropriate
 * error response and not process it.
 *
 * Tests both auth middleware implementations:
 * - Cognito (backend/src/middleware/auth.ts)
 * - Local JWT (backend/src/middleware/auth-local.ts)
 *
 * **Validates: Requirements 15.1, 15.2**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
import {
  validateLocalToken,
  authMiddleware,
  generateLocalToken,
} from './auth-local.js';
import {
  authenticate,
  extractToken,
  type CognitoAuthConfig,
} from './auth.js';
import type { Request, Response, NextFunction } from 'express';

// ─── Test Setup ──────────────────────────────────────────────────────────────

const LOCAL_SECRET = 'kirana-ai-local-dev-secret';
const LOCAL_ISSUER = 'kirana-ai-local';

// RSA key pair for Cognito tests
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const TEST_KID = 'test-key-id-1';

const COGNITO_CONFIG: CognitoAuthConfig = {
  userPoolId: 'ap-south-1_TestPool123',
  region: 'ap-south-1',
  clientId: 'test-client-id-abc123',
};

const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_CONFIG.region}.amazonaws.com/${COGNITO_CONFIG.userPoolId}`;

function createMockJwksClient() {
  return {
    getSigningKey: (
      kid: string,
      callback: (err: Error | null, key?: { getPublicKey: () => string }) => void
    ) => {
      if (kid === TEST_KID) {
        callback(null, { getPublicKey: () => publicKey });
      } else {
        callback(new Error(`Unknown kid: ${kid}`));
      }
    },
  } as any;
}

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

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary random strings that are NOT valid JWTs */
const invalidTokenArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(''),
  fc.constant('not-a-jwt'),
  fc.constant('abc.def.ghi'),
  // Three-segment strings that look like JWTs but aren't valid base64
  fc.tuple(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 20 })
  ).map(([a, b, c]) => `${a}.${b}.${c}`),
  // Random base64 segments
  fc.tuple(
    fc.base64String({ minLength: 4, maxLength: 40 }),
    fc.base64String({ minLength: 4, maxLength: 40 }),
    fc.base64String({ minLength: 4, maxLength: 40 })
  ).map(([a, b, c]) => `${a}.${b}.${c}`)
);

/** Arbitrary expired local JWT tokens */
const expiredLocalTokenArb = fc.string({ minLength: 1, maxLength: 30 }).map((userId) => {
  return jwt.sign({ sub: userId }, LOCAL_SECRET, {
    issuer: LOCAL_ISSUER,
    expiresIn: '-1s',
  });
});

/** Arbitrary tokens signed with wrong secret */
const wrongSecretTokenArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.string({ minLength: 8, maxLength: 40 })
).map(([userId, wrongSecret]) => {
  return jwt.sign({ sub: userId }, wrongSecret + '-definitely-wrong', {
    issuer: LOCAL_ISSUER,
    expiresIn: '1h',
  });
});

/** Arbitrary tokens with wrong issuer */
const wrongIssuerTokenArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.string({ minLength: 3, maxLength: 20 })
).map(([userId, wrongIssuer]) => {
  return jwt.sign({ sub: userId }, LOCAL_SECRET, {
    issuer: wrongIssuer + '-wrong-issuer',
    expiresIn: '1h',
  });
});

/** Arbitrary tokens missing sub claim */
const missingSubTokenArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  role: fc.string({ minLength: 1, maxLength: 10 }),
}).map((payload) => {
  return jwt.sign(payload, LOCAL_SECRET, {
    issuer: LOCAL_ISSUER,
    expiresIn: '1h',
  });
});

/** Arbitrary missing/malformed Authorization header values */
const missingOrMalformedAuthHeaderArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  // Non-Bearer prefixed strings
  fc.string({ minLength: 1, maxLength: 50 }).map((s) => `Basic ${s}`),
  fc.string({ minLength: 1, maxLength: 50 }).map((s) => `Token ${s}`)
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 18: Authentication Enforcement', () => {
  describe('Local JWT middleware rejects invalid tokens', () => {
    it('any random string token is rejected by validateLocalToken', () => {
      fc.assert(
        fc.property(invalidTokenArb, (token) => {
          const result = validateLocalToken(token);
          expect(result).toBeNull();
        }),
        { numRuns: 200 }
      );
    });

    it('expired tokens are always rejected', () => {
      fc.assert(
        fc.property(expiredLocalTokenArb, (token) => {
          const result = validateLocalToken(token);
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('tokens signed with wrong secret are always rejected', () => {
      fc.assert(
        fc.property(wrongSecretTokenArb, (token) => {
          const result = validateLocalToken(token);
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('tokens with wrong issuer are always rejected', () => {
      fc.assert(
        fc.property(wrongIssuerTokenArb, (token) => {
          const result = validateLocalToken(token);
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('tokens missing sub claim are always rejected', () => {
      fc.assert(
        fc.property(missingSubTokenArb, (token) => {
          const result = validateLocalToken(token);
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Express authMiddleware rejects and does not process', () => {
    it('requests with missing/malformed auth header are rejected with 401 and next() is not called', () => {
      fc.assert(
        fc.property(missingOrMalformedAuthHeaderArb, (authHeaderValue) => {
          const headers: Record<string, string> = {};
          if (authHeaderValue !== undefined) {
            headers.authorization = authHeaderValue;
          }

          const req = mockRequest({ headers });
          const res = mockResponse();
          const next = vi.fn();

          authMiddleware(req, res as unknown as Response, next as NextFunction);

          // Must be rejected with 401
          expect(res.statusCode).toBe(401);
          // next() must NOT be called — no processing occurs
          expect(next).not.toHaveBeenCalled();
          // Error response must be present
          expect(res.jsonBody).toHaveProperty('error');
        }),
        { numRuns: 200 }
      );
    });

    it('requests with invalid Bearer tokens are rejected with 401 and next() is not called', () => {
      fc.assert(
        fc.property(invalidTokenArb, (invalidToken) => {
          const req = mockRequest({
            headers: { authorization: `Bearer ${invalidToken}` },
          });
          const res = mockResponse();
          const next = vi.fn();

          authMiddleware(req, res as unknown as Response, next as NextFunction);

          // Must be rejected with 401
          expect(res.statusCode).toBe(401);
          // next() must NOT be called — no processing occurs
          expect(next).not.toHaveBeenCalled();
          // Error response body present
          expect(res.jsonBody).toHaveProperty('error');
        }),
        { numRuns: 200 }
      );
    });

    it('requests with expired Bearer tokens are rejected with 401 and not processed', () => {
      fc.assert(
        fc.property(expiredLocalTokenArb, (expiredToken) => {
          const req = mockRequest({
            headers: { authorization: `Bearer ${expiredToken}` },
          });
          const res = mockResponse();
          const next = vi.fn();

          authMiddleware(req, res as unknown as Response, next as NextFunction);

          expect(res.statusCode).toBe(401);
          expect(next).not.toHaveBeenCalled();
          expect(res.jsonBody).toHaveProperty('error');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Cognito authenticate rejects invalid requests', () => {
    const mockClient = createMockJwksClient();

    it('requests with no token at all are rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            { queryStringParameters: null, headers: null },
            { queryStringParameters: {}, headers: {} },
            { queryStringParameters: null, headers: {} },
            { queryStringParameters: {}, headers: null }
          ),
          async (params) => {
            const result = await authenticate(params, COGNITO_CONFIG, mockClient);
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe('TOKEN_MISSING');
              expect(result.error).toBeDefined();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('any random non-empty token string is rejected by Cognito auth', async () => {
      // Filter out empty strings since extractToken treats them as no token (TOKEN_MISSING)
      const nonEmptyInvalidTokenArb = invalidTokenArb.filter((t) => t.length > 0);

      await fc.assert(
        fc.asyncProperty(nonEmptyInvalidTokenArb, async (invalidToken) => {
          const result = await authenticate(
            { headers: { Authorization: `Bearer ${invalidToken}` } },
            COGNITO_CONFIG,
            mockClient
          );
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(['TOKEN_MISSING', 'TOKEN_INVALID', 'JWKS_ERROR', 'CLAIMS_INVALID']).toContain(result.code);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('tokens signed with correct key but unknown kid are rejected by Cognito auth', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-zA-Z0-9_-]{1,30}$/),
          fc.stringMatching(/^[a-zA-Z0-9_-]{3,20}$/),
          async (userId, unknownKid) => {
            const payload = {
              sub: userId,
              'cognito:username': userId,
              token_use: 'id',
              iss: COGNITO_ISSUER,
              aud: COGNITO_CONFIG.clientId,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
            };

            const token = jwt.sign(payload, privateKey, {
              algorithm: 'RS256',
              header: { alg: 'RS256', typ: 'JWT', kid: unknownKid + '-unknown' },
            });

            const result = await authenticate(
              { headers: { Authorization: `Bearer ${token}` } },
              COGNITO_CONFIG,
              mockClient
            );
            // Token is rejected regardless of the specific error code
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('empty Authorization header results in rejection', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            { headers: { Authorization: '' } },
            { headers: { Authorization: 'Bearer ' } },
            { headers: {} }
          ),
          async (params) => {
            const result = await authenticate(params, COGNITO_CONFIG, mockClient);
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Contrast: valid tokens ARE accepted', () => {
    it('valid local tokens with any userId are always accepted', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          (userId) => {
            const token = generateLocalToken(userId);
            const result = validateLocalToken(token);
            expect(result).not.toBeNull();
            expect(result!.userId).toBe(userId);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('valid local tokens pass Express middleware and call next()', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          (userId) => {
            const token = generateLocalToken(userId);
            const req = mockRequest({
              headers: { authorization: `Bearer ${token}` },
            });
            const res = mockResponse();
            const next = vi.fn();

            authMiddleware(req, res as unknown as Response, next as NextFunction);

            // Should call next — processing proceeds
            expect(next).toHaveBeenCalled();
            // Status should not be set to 401
            expect(res.statusCode).not.toBe(401);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
