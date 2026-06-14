/**
 * Cognito Auth Middleware (Primary Provider)
 *
 * Validates JWT tokens issued by AWS Cognito on WebSocket $connect
 * and message routes. Extracts userId from token claims.
 *
 * Requirements: 15.1, 15.2
 */

import jwt, { JwtHeader, SigningKeyCallback, JwtPayload } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// --- Configuration ---

export interface CognitoAuthConfig {
  /** Cognito User Pool ID (e.g., 'ap-south-1_XXXXXX') */
  userPoolId: string;
  /** AWS region (e.g., 'ap-south-1') */
  region: string;
  /** Expected audience (Cognito App Client ID) */
  clientId: string;
}

// --- Result Types ---

export interface AuthSuccess {
  success: true;
  userId: string;
  claims: Record<string, unknown>;
}

export interface AuthFailure {
  success: false;
  error: string;
  code: 'TOKEN_MISSING' | 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'JWKS_ERROR' | 'CLAIMS_INVALID';
}

export type AuthResult = AuthSuccess | AuthFailure;

// --- JWKS Client Factory ---

/**
 * Creates a JWKS client for fetching Cognito public keys.
 */
export function createJwksClient(config: CognitoAuthConfig): jwksClient.JwksClient {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  return jwksClient({
    jwksUri: `${issuer}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
}

// --- Key Retrieval ---

/**
 * Creates a signing key callback for jsonwebtoken's verify method.
 */
export function getSigningKeyCallback(client: jwksClient.JwksClient) {
  return (header: JwtHeader, callback: SigningKeyCallback): void => {
    if (!header.kid) {
      callback(new Error('Token header missing kid'));
      return;
    }
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  };
}

// --- Token Extraction ---

/**
 * Extracts JWT token from WebSocket connect query params or message headers.
 *
 * For WebSocket $connect: token is in query string (?token=xxx)
 * For message routes: token is in Authorization header or message payload
 */
export function extractToken(params: {
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
}): string | null {
  // Try query string first (WebSocket $connect)
  const queryToken = params.queryStringParameters?.token;
  if (queryToken) {
    return queryToken;
  }

  // Try Authorization header (message routes)
  const authHeader =
    params.headers?.Authorization ||
    params.headers?.authorization;
  if (authHeader) {
    // Support "Bearer <token>" format
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return authHeader;
  }

  return null;
}

// --- Token Validation ---

/**
 * Validates a Cognito JWT token and extracts the userId.
 *
 * Verifies:
 * - Token signature against JWKS
 * - Token issuer matches Cognito user pool
 * - Token audience matches app client ID (for id_token)
 * - Token has not expired
 * - Token use is 'id' or 'access'
 */
export async function validateToken(
  token: string,
  config: CognitoAuthConfig,
  client: jwksClient.JwksClient
): Promise<AuthResult> {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;

  return new Promise<AuthResult>((resolve) => {
    jwt.verify(
      token,
      getSigningKeyCallback(client),
      {
        issuer,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            resolve({
              success: false,
              error: 'Token has expired',
              code: 'TOKEN_EXPIRED',
            });
          } else if (err.name === 'JsonWebTokenError') {
            resolve({
              success: false,
              error: `Invalid token: ${err.message}`,
              code: 'TOKEN_INVALID',
            });
          } else {
            resolve({
              success: false,
              error: `Token verification failed: ${err.message}`,
              code: 'JWKS_ERROR',
            });
          }
          return;
        }

        const payload = decoded as JwtPayload;

        if (!payload) {
          resolve({
            success: false,
            error: 'Token payload is empty',
            code: 'TOKEN_INVALID',
          });
          return;
        }

        // Validate token_use claim
        const tokenUse = payload.token_use as string | undefined;
        if (tokenUse !== 'id' && tokenUse !== 'access') {
          resolve({
            success: false,
            error: `Invalid token_use: ${tokenUse}. Expected 'id' or 'access'`,
            code: 'CLAIMS_INVALID',
          });
          return;
        }

        // For id tokens, verify audience matches client ID
        if (tokenUse === 'id' && payload.aud !== config.clientId) {
          resolve({
            success: false,
            error: 'Token audience does not match expected client ID',
            code: 'CLAIMS_INVALID',
          });
          return;
        }

        // For access tokens, verify client_id claim
        if (tokenUse === 'access' && payload.client_id !== config.clientId) {
          resolve({
            success: false,
            error: 'Token client_id does not match expected client ID',
            code: 'CLAIMS_INVALID',
          });
          return;
        }

        // Extract userId from sub or cognito:username
        const userId =
          (payload['cognito:username'] as string) ||
          payload.sub;

        if (!userId) {
          resolve({
            success: false,
            error: 'Token missing user identifier (sub or cognito:username)',
            code: 'CLAIMS_INVALID',
          });
          return;
        }

        resolve({
          success: true,
          userId,
          claims: payload as Record<string, unknown>,
        });
      }
    );
  });
}

// --- Main Auth Middleware ---

/**
 * Authenticate a WebSocket connection or message request.
 *
 * Usage for WebSocket $connect:
 *   const result = await authenticate({
 *     queryStringParameters: event.queryStringParameters
 *   }, config, client);
 *
 * Usage for message routes:
 *   const result = await authenticate({
 *     headers: event.headers
 *   }, config, client);
 */
export async function authenticate(
  params: {
    queryStringParameters?: Record<string, string | undefined> | null;
    headers?: Record<string, string | undefined> | null;
  },
  config: CognitoAuthConfig,
  client: jwksClient.JwksClient
): Promise<AuthResult> {
  const token = extractToken(params);

  if (!token) {
    return {
      success: false,
      error: 'No authentication token provided',
      code: 'TOKEN_MISSING',
    };
  }

  return validateToken(token, config, client);
}

// --- Singleton Setup ---

let _config: CognitoAuthConfig | null = null;
let _client: jwksClient.JwksClient | null = null;

/**
 * Initialize the auth middleware with Cognito configuration.
 * Call this once at startup.
 */
export function initAuth(config: CognitoAuthConfig): void {
  _config = config;
  _client = createJwksClient(config);
}

/**
 * Get the configured JWKS client. Throws if not initialized.
 */
export function getClient(): jwksClient.JwksClient {
  if (!_client) {
    throw new Error('Auth middleware not initialized. Call initAuth() first.');
  }
  return _client;
}

/**
 * Get the configured auth config. Throws if not initialized.
 */
export function getConfig(): CognitoAuthConfig {
  if (!_config) {
    throw new Error('Auth middleware not initialized. Call initAuth() first.');
  }
  return _config;
}

/**
 * Convenience method using singleton config/client.
 * Requires initAuth() to have been called.
 */
export async function authenticateRequest(params: {
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
}): Promise<AuthResult> {
  return authenticate(params, getConfig(), getClient());
}
