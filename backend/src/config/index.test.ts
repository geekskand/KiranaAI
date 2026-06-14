/**
 * Unit tests for the environment configuration module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, isLocalMode, resetConfig } from './index.js';
import type { AppConfig } from './index.js';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('getConfig()', () => {
    it('defaults to LOCAL environment when KIRANA_ENV is not set', () => {
      delete process.env['KIRANA_ENV'];
      const config = getConfig();
      expect(config.environment).toBe('LOCAL');
    });

    it('resolves DEV environment', () => {
      process.env['KIRANA_ENV'] = 'DEV';
      const config = getConfig();
      expect(config.environment).toBe('DEV');
    });

    it('resolves PROD environment', () => {
      process.env['KIRANA_ENV'] = 'PROD';
      const config = getConfig();
      expect(config.environment).toBe('PROD');
    });

    it('defaults to LOCAL for unrecognized KIRANA_ENV values', () => {
      process.env['KIRANA_ENV'] = 'staging';
      const config = getConfig();
      expect(config.environment).toBe('LOCAL');
    });

    it('returns sensible LOCAL defaults', () => {
      delete process.env['KIRANA_ENV'];
      const config = getConfig();

      expect(config.dynamodb.tableName).toBe('KiranaAI');
      expect(config.dynamodb.endpoint).toBeUndefined();
      expect(config.dynamodb.region).toBe('ap-south-1');

      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);

      expect(config.bedrock.modelId).toContain('claude');
      expect(config.bedrock.region).toBe('ap-south-1');

      expect(config.cognito.userPoolId).toBe('local-pool');
      expect(config.cognito.clientId).toBe('local-client');

      expect(config.auth.jwtSecret).toBe('kirana-ai-local-dev-secret');
      expect(config.auth.issuer).toBe('kirana-ai-local');

      expect(config.server.port).toBe(3000);
      expect(config.server.wsPort).toBe(3000);

      expect(config.freeDeliveryThreshold).toBe(199);
    });

    it('reads custom values from environment variables', () => {
      process.env['KIRANA_ENV'] = 'DEV';
      process.env['DYNAMODB_TABLE'] = 'MyTable';
      process.env['DYNAMODB_ENDPOINT'] = 'http://localhost:8000';
      process.env['AWS_REGION'] = 'us-east-1';
      process.env['REDIS_HOST'] = 'redis.dev.internal';
      process.env['REDIS_PORT'] = '6380';
      process.env['BEDROCK_MODEL_ID'] = 'anthropic.claude-3-haiku';
      process.env['COGNITO_USER_POOL_ID'] = 'us-east-1_abc123';
      process.env['COGNITO_CLIENT_ID'] = 'client-abc';
      process.env['JWT_SECRET'] = 'my-secret';
      process.env['JWT_ISSUER'] = 'my-issuer';
      process.env['PORT'] = '8080';
      process.env['WS_PORT'] = '8081';
      process.env['FREE_DELIVERY_THRESHOLD'] = '299';

      const config = getConfig();

      expect(config.environment).toBe('DEV');
      expect(config.dynamodb.tableName).toBe('MyTable');
      expect(config.dynamodb.endpoint).toBe('http://localhost:8000');
      expect(config.dynamodb.region).toBe('us-east-1');
      expect(config.redis.host).toBe('redis.dev.internal');
      expect(config.redis.port).toBe(6380);
      expect(config.bedrock.modelId).toBe('anthropic.claude-3-haiku');
      expect(config.cognito.userPoolId).toBe('us-east-1_abc123');
      expect(config.cognito.clientId).toBe('client-abc');
      expect(config.auth.jwtSecret).toBe('my-secret');
      expect(config.auth.issuer).toBe('my-issuer');
      expect(config.server.port).toBe(8080);
      expect(config.server.wsPort).toBe(8081);
      expect(config.freeDeliveryThreshold).toBe(299);
    });

    it('caches config on subsequent calls', () => {
      delete process.env['KIRANA_ENV'];
      const config1 = getConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2); // Same reference
    });

    it('LOCAL mode: DynamoDB endpoint is undefined (signals local JSON fallback)', () => {
      delete process.env['KIRANA_ENV'];
      const config = getConfig();
      expect(config.dynamodb.endpoint).toBeUndefined();
    });

    it('DEV mode: DynamoDB endpoint can be set via env var', () => {
      process.env['KIRANA_ENV'] = 'DEV';
      process.env['DYNAMODB_ENDPOINT'] = 'http://dynamodb-local:8000';
      const config = getConfig();
      expect(config.dynamodb.endpoint).toBe('http://dynamodb-local:8000');
    });
  });

  describe('isLocalMode()', () => {
    it('returns true when environment is LOCAL', () => {
      delete process.env['KIRANA_ENV'];
      expect(isLocalMode()).toBe(true);
    });

    it('returns false when environment is DEV', () => {
      process.env['KIRANA_ENV'] = 'DEV';
      expect(isLocalMode()).toBe(false);
    });

    it('returns false when environment is PROD', () => {
      process.env['KIRANA_ENV'] = 'PROD';
      expect(isLocalMode()).toBe(false);
    });
  });
});
