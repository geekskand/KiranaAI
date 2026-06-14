/**
 * Property 20: Fallback Auth Equivalence
 *
 * For any valid authentication token, the local JWT fallback provider SHALL
 * extract the same user identity and validate the token with equivalent
 * accept/reject behavior as the Cognito provider.
 *
 * **Validates: Requirements 14.2**
 *
 * Strategy: Since Cognito uses RS256/JWKS and Local JWT uses HS256, we cannot
 * use the same raw token with both. Instead, we test the behavioral contract:
 * 1. Both providers accept tokens they issue and extract the correct userId.
 * 2. Both providers reject invalid/expired/tampered tokens.
 * 3. The identity extracted from equivalent valid tokens is the same userId.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
import {
  validateToken,
  extractToken,
  authenticate,
  type CognitoAuthConfig,
} from './auth.js';
import {
  generateLocalToken,
  validateLocalToken,
} from './auth-local.js';

// --- Test Infrastructure ---

// RSA key pair for Cognito-style tokens (generated once for all tests)
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const TEST_KID = 'test-key-equiv-1';

const COGNITO_CONFIG: CognitoAuthConfig = {
  userPoolId: 'ap-south-1_EquivTest',
  region: 'ap-south-1',
  clientId: 'equiv-test-client-id',
};

const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_CONFIG.region}.amazonaws.com/${COGNITO_CONFIG.userPoolId}`;

const LOCAL_SECRET = 'kirana-ai-local-dev-secret';
const LOCAL_ISSUER = 'kirana-ai-local';

// Mock JWKS client that returns our test public key
function createMockJwksClient() {
  return {
    getSigningKey: (kid: string, callback: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
      if (kid === TEST_KID) {
        callback(null, { getPublicKey: () => publicKey });
      } else {
        callback(new Error(`Unknown kid: ${kid}`));
      }
    },
  } as any;
}

const mockClient = createMockJwksClient();

/**
 * Generate a valid Cognito-style JWT for a given userId.
 */
function generateCognitoToken(userId: string): string {
  const payload = {
    sub: userId,
    'cognito:username': userId,
    token_use: 'id' as const,
    iss: COGNITO_ISSUER,
    aud: COGNITO_CONFIG.clientId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT', kid: TEST_KID },
  });
}

/**
 * Generate an expired Cognito-style JWT.
 */
function generateExpiredCognitoToken(userId: string): string {
  const payload = {
    sub: userId,
    'cognito:username': userId,
    token_use: 'id' as const,
    iss: COGNITO_ISSUER,
    aud: COGNITO_CONFIG.clientId,
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT', kid: TEST_KID },
  });
}

// --- Generators ---

/**
 * Generate valid user IDs (non-empty alphanumeric strings with hyphens/underscores).
 */
const userIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('')),
  { minLength: 1, maxLength: 30 }
);

// --- Property Tests ---

describe('Property 20: Fallback Auth Equivalence', () => {
  it('both providers extract the same userId from their respective valid tokens', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        // Generate valid tokens from each provider
        const cognitoToken = generateCognitoToken(userId);
        const localToken = generateLocalToken(userId);

        // Validate with respective providers
        const cognitoResult = await validateToken(cognitoToken, COGNITO_CONFIG, mockClient);
        const localResult = validateLocalToken(localToken);

        // Both should succeed
        expect(cognitoResult.success).toBe(true);
        expect(localResult).not.toBeNull();

        // Both should extract the same userId
        if (cognitoResult.success && localResult) {
          expect(cognitoResult.userId).toBe(userId);
          expect(localResult.userId).toBe(userId);
          // Identity equivalence: same userId from both providers
          expect(cognitoResult.userId).toBe(localResult.userId);
        }
      }),
      { numRuns: 20 }
    );
  });

  it('both providers reject invalid/garbage tokens equivalently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
          // Exclude strings that could decode as valid JWTs
          return jwt.decode(s) === null;
        }),
        async (invalidToken) => {
          // Cognito provider should reject
          const cognitoResult = await validateToken(invalidToken, COGNITO_CONFIG, mockClient);
          // Local provider should reject
          const localResult = validateLocalToken(invalidToken);

          // Both should reject the invalid token
          expect(cognitoResult.success).toBe(false);
          expect(localResult).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('both providers reject expired tokens equivalently', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        // Generate expired tokens for each provider
        const expiredCognitoToken = generateExpiredCognitoToken(userId);
        const expiredLocalToken = jwt.sign(
          { sub: userId },
          LOCAL_SECRET,
          { issuer: LOCAL_ISSUER, expiresIn: '-1s' }
        );

        // Both should reject expired tokens
        const cognitoResult = await validateToken(expiredCognitoToken, COGNITO_CONFIG, mockClient);
        const localResult = validateLocalToken(expiredLocalToken);

        expect(cognitoResult.success).toBe(false);
        if (!cognitoResult.success) {
          expect(cognitoResult.code).toBe('TOKEN_EXPIRED');
        }
        expect(localResult).toBeNull();
      }),
      { numRuns: 20 }
    );
  });

  it('both providers accept tokens and the authenticate flow extracts matching identity', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        // Cognito authenticate flow via header
        const cognitoToken = generateCognitoToken(userId);
        const cognitoResult = await authenticate(
          { headers: { Authorization: `Bearer ${cognitoToken}` } },
          COGNITO_CONFIG,
          mockClient
        );

        // Local authenticate flow via validateLocalToken (simulating middleware)
        const localToken = generateLocalToken(userId);
        const localResult = validateLocalToken(localToken);

        // Both should succeed and extract the same userId
        expect(cognitoResult.success).toBe(true);
        expect(localResult).not.toBeNull();

        if (cognitoResult.success && localResult) {
          expect(cognitoResult.userId).toBe(localResult.userId);
        }
      }),
      { numRuns: 20 }
    );
  });

  it('token extraction works equivalently for both providers via header format', () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        // Both providers use Bearer token format in headers
        const localToken = generateLocalToken(userId);
        const cognitoToken = generateCognitoToken(userId);

        // extractToken (from Cognito auth) works for any Bearer token
        const extractedLocal = extractToken({
          headers: { Authorization: `Bearer ${localToken}` },
        });
        const extractedCognito = extractToken({
          headers: { Authorization: `Bearer ${cognitoToken}` },
        });

        // Both tokens should be extractable via same mechanism
        expect(extractedLocal).toBe(localToken);
        expect(extractedCognito).toBe(cognitoToken);
      }),
      { numRuns: 50 }
    );
  });

  it('both providers reject missing tokens equivalently', async () => {
    // Cognito: no token provided
    const cognitoResult = await authenticate(
      { headers: {} },
      COGNITO_CONFIG,
      mockClient
    );

    // Local: empty string token
    const localResult = validateLocalToken('');

    // Both reject
    expect(cognitoResult.success).toBe(false);
    if (!cognitoResult.success) {
      expect(cognitoResult.code).toBe('TOKEN_MISSING');
    }
    expect(localResult).toBeNull();
  });
});
