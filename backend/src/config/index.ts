/**
 * Environment-aware configuration for KiranaAI.
 *
 * Supports LOCAL, DEV, and PROD environments with sensible defaults.
 * In LOCAL mode, all providers fall back to local implementations
 * (no AWS credentials needed).
 *
 * Requirements: 11.1, 12.1, 14.1
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Environment = 'LOCAL' | 'DEV' | 'PROD';

export interface DynamoDBConfig {
  /** DynamoDB table name */
  tableName: string;
  /**
   * Custom endpoint URL for DynamoDB (e.g., local DynamoDB).
   * When undefined in LOCAL mode, signals use of local JSON fallback.
   */
  endpoint?: string;
  /** AWS region for DynamoDB */
  region: string;
}

export interface RedisConfig {
  /** Redis host */
  host: string;
  /** Redis port */
  port: number;
}

export interface BedrockConfig {
  /** Bedrock model ID */
  modelId: string;
  /** AWS region for Bedrock */
  region: string;
}

export interface CognitoConfig {
  /** Cognito User Pool ID */
  userPoolId: string;
  /** Cognito App Client ID */
  clientId: string;
  /** AWS region for Cognito */
  region: string;
}

export interface AuthConfig {
  /** JWT secret for local auth fallback */
  jwtSecret: string;
  /** Token issuer identifier */
  issuer: string;
}

export interface ServerConfig {
  /** HTTP server port */
  port: number;
  /** WebSocket server port (same as HTTP in Express mode) */
  wsPort: number;
}

export interface AppConfig {
  /** Current environment */
  environment: Environment;
  /** DynamoDB configuration */
  dynamodb: DynamoDBConfig;
  /** Redis configuration */
  redis: RedisConfig;
  /** Bedrock configuration */
  bedrock: BedrockConfig;
  /** Cognito configuration */
  cognito: CognitoConfig;
  /** Auth configuration (local JWT fallback) */
  auth: AuthConfig;
  /** Server configuration */
  server: ServerConfig;
  /** Free delivery threshold in INR */
  freeDeliveryThreshold: number;
}

// ─── Environment Detection ───────────────────────────────────────────────────

/**
 * Determine the current environment from the KIRANA_ENV variable.
 * Defaults to LOCAL if not set or unrecognized.
 */
function resolveEnvironment(): Environment {
  const env = (process.env['KIRANA_ENV'] || 'LOCAL').toUpperCase();
  if (env === 'DEV' || env === 'PROD') {
    return env;
  }
  return 'LOCAL';
}

// ─── Config Builders ─────────────────────────────────────────────────────────

function buildDynamoDBConfig(environment: Environment): DynamoDBConfig {
  const tableName = process.env['DYNAMODB_TABLE'] || 'KiranaAI';
  const region = process.env['AWS_REGION'] || 'ap-south-1';

  if (environment === 'LOCAL') {
    // endpoint = undefined signals use of local JSON fallback provider
    return { tableName, endpoint: undefined, region };
  }

  // DEV/PROD: use real DynamoDB, allow custom endpoint for DynamoDB Local
  const endpoint = process.env['DYNAMODB_ENDPOINT'] || undefined;
  return { tableName, endpoint, region };
}

function buildRedisConfig(environment: Environment): RedisConfig {
  if (environment === 'LOCAL') {
    // In LOCAL mode, in-memory fallback is used — these values are placeholders
    return {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    };
  }

  return {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
  };
}

function buildBedrockConfig(environment: Environment): BedrockConfig {
  if (environment === 'LOCAL') {
    // In LOCAL mode, rule-based fallback agent is used
    return {
      modelId: process.env['BEDROCK_MODEL_ID'] || 'anthropic.claude-3-sonnet-20240229-v1:0',
      region: process.env['AWS_REGION'] || 'ap-south-1',
    };
  }

  return {
    modelId: process.env['BEDROCK_MODEL_ID'] || 'anthropic.claude-3-sonnet-20240229-v1:0',
    region: process.env['AWS_REGION'] || 'ap-south-1',
  };
}

function buildCognitoConfig(environment: Environment): CognitoConfig {
  if (environment === 'LOCAL') {
    // In LOCAL mode, local JWT auth is used — these are placeholders
    return {
      userPoolId: process.env['COGNITO_USER_POOL_ID'] || 'local-pool',
      clientId: process.env['COGNITO_CLIENT_ID'] || 'local-client',
      region: process.env['AWS_REGION'] || 'ap-south-1',
    };
  }

  return {
    userPoolId: process.env['COGNITO_USER_POOL_ID'] || '',
    clientId: process.env['COGNITO_CLIENT_ID'] || '',
    region: process.env['AWS_REGION'] || 'ap-south-1',
  };
}

function buildAuthConfig(): AuthConfig {
  return {
    jwtSecret: process.env['JWT_SECRET'] || 'kirana-ai-local-dev-secret',
    issuer: process.env['JWT_ISSUER'] || 'kirana-ai-local',
  };
}

function buildServerConfig(): ServerConfig {
  const port = parseInt(process.env['PORT'] || '3000', 10);
  const wsPort = parseInt(process.env['WS_PORT'] || String(port), 10);
  return { port, wsPort };
}

// ─── Config Factory ──────────────────────────────────────────────────────────

/**
 * Build the full application config for the resolved environment.
 */
function buildConfig(): AppConfig {
  const environment = resolveEnvironment();

  return {
    environment,
    dynamodb: buildDynamoDBConfig(environment),
    redis: buildRedisConfig(environment),
    bedrock: buildBedrockConfig(environment),
    cognito: buildCognitoConfig(environment),
    auth: buildAuthConfig(),
    server: buildServerConfig(),
    freeDeliveryThreshold: parseInt(
      process.env['FREE_DELIVERY_THRESHOLD'] || '199',
      10
    ),
  };
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _config: AppConfig | null = null;

/**
 * Get the current application configuration.
 * Config is built once and cached for the lifetime of the process.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    _config = buildConfig();
  }
  return _config;
}

/**
 * Returns true when the application is running in LOCAL mode.
 * In LOCAL mode, all providers use fallback implementations
 * (no AWS credentials needed).
 */
export function isLocalMode(): boolean {
  return getConfig().environment === 'LOCAL';
}

/**
 * Reset the config singleton (useful for testing).
 */
export function resetConfig(): void {
  _config = null;
}
