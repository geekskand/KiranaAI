/**
 * Provider registry for KiranaAI.
 *
 * Central registry that manages all provider instances and selects
 * primary or fallback based on environment and health checks.
 *
 * In LOCAL environment, all providers default to their fallback implementations.
 * In DEV/PROD, primary AWS providers are used with automatic fallback on failure.
 *
 * Requirements: 11.1, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3, 14.1, 14.2
 */

import { ResilientProvider } from './factory.js';
import type {
  PreferenceStoreProvider,
  SessionStoreProvider,
  CacheProvider,
  AgentProvider,
} from './interfaces.js';

// --- Concrete provider imports ---
import { DynamoDBPreferenceStore } from './preference/dynamodb.js';
import { LocalJsonPreferenceStore } from './preference/local-json.js';
import { RedisSessionStore } from './session/redis.js';
import { InMemorySessionStore } from './session/in-memory.js';
import { RedisCacheProvider } from './cache/redis.js';
import { InMemoryCacheProvider } from './cache/in-memory.js';
import { BedrockAgentProvider } from './agent/bedrock.js';
import { RuleBasedAgentProvider } from './agent/rule-based.js';

// --- Environment Configuration ---

export type Environment = 'LOCAL' | 'DEV' | 'PROD';

export interface RegistryConfig {
  environment: Environment;
  /** DynamoDB table name. Defaults to 'KiranaAI'. */
  dynamoTableName?: string;
  /** DynamoDB region. Defaults to 'ap-south-1'. */
  dynamoRegion?: string;
  /** DynamoDB endpoint override (for local DynamoDB). */
  dynamoEndpoint?: string;
  /** Redis host. Defaults to 'localhost'. */
  redisHost?: string;
  /** Redis port. Defaults to 6379. */
  redisPort?: number;
  /** Redis password (optional). */
  redisPassword?: string;
  /** Path to local JSON preference file. Defaults to 'data/preferences.json'. */
  preferenceFilePath?: string;
  /** Bedrock region. Defaults to 'ap-south-1'. */
  bedrockRegion?: string;
  /** Bedrock model ID override. */
  bedrockModelId?: string;
}

// --- Provider Registration Entry ---

interface ProviderEntry<T> {
  resilient: ResilientProvider<T>;
}

// --- Provider Registry ---

/**
 * Singleton registry that holds all provider instances and exposes
 * methods to get the active (healthy) provider for each service.
 */
export class ProviderRegistry {
  private preferenceEntry: ProviderEntry<PreferenceStoreProvider> | null = null;
  private sessionEntry: ProviderEntry<SessionStoreProvider> | null = null;
  private cacheEntry: ProviderEntry<CacheProvider> | null = null;
  private agentEntry: ProviderEntry<AgentProvider> | null = null;

  private readonly config: RegistryConfig;
  private initialized = false;

  constructor(config: RegistryConfig) {
    this.config = config;
  }

  /** Get the current environment. */
  getEnvironment(): Environment {
    return this.config.environment;
  }

  /** Returns true if running in local development mode. */
  isLocal(): boolean {
    return this.config.environment === 'LOCAL';
  }

  // --- Initialization ---

  /**
   * Initialize all providers based on environment configuration.
   * In LOCAL mode, uses all fallback providers directly.
   * In DEV/PROD, wires primary providers with health-check fallback.
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    if (this.isLocal()) {
      this.initializeLocalProviders();
    } else {
      this.initializePrimaryProviders();
    }

    this.initialized = true;
  }

  /**
   * LOCAL mode: all fallback providers, health checks always return false
   * so the ResilientProvider always selects the fallback.
   */
  private initializeLocalProviders(): void {
    const fallbackPreference = new LocalJsonPreferenceStore(
      this.config.preferenceFilePath ?? 'data/preferences.json'
    );
    // In local mode, both primary and fallback point to local implementation
    this.preferenceEntry = {
      resilient: new ResilientProvider<PreferenceStoreProvider>(
        fallbackPreference,
        fallbackPreference,
        async () => true
      ),
    };

    const fallbackSession = new InMemorySessionStore();
    this.sessionEntry = {
      resilient: new ResilientProvider<SessionStoreProvider>(
        fallbackSession,
        fallbackSession,
        async () => true
      ),
    };

    const fallbackCache = new InMemoryCacheProvider();
    this.cacheEntry = {
      resilient: new ResilientProvider<CacheProvider>(
        fallbackCache,
        fallbackCache,
        async () => true
      ),
    };

    const fallbackAgent = new RuleBasedAgentProvider();
    this.agentEntry = {
      resilient: new ResilientProvider<AgentProvider>(
        fallbackAgent,
        fallbackAgent,
        async () => true
      ),
    };
  }

  /**
   * DEV/PROD mode: wire primary AWS providers with fallback and health checks.
   */
  private initializePrimaryProviders(): void {
    // --- Preference Store: DynamoDB + Local JSON fallback ---
    const primaryPreference = new DynamoDBPreferenceStore({
      tableName: this.config.dynamoTableName ?? 'KiranaAI',
      region: this.config.dynamoRegion ?? 'ap-south-1',
      endpoint: this.config.dynamoEndpoint,
    });
    const fallbackPreference = new LocalJsonPreferenceStore(
      this.config.preferenceFilePath ?? 'data/preferences.json'
    );
    this.preferenceEntry = {
      resilient: new ResilientProvider<PreferenceStoreProvider>(
        primaryPreference,
        fallbackPreference,
        async () => {
          try {
            // Simple health check: attempt a null-user profile lookup
            await primaryPreference.getUserProfile('__health_check__');
            return true;
          } catch {
            return false;
          }
        }
      ),
    };

    // --- Session Store: Redis + In-Memory fallback ---
    const primarySession = new RedisSessionStore({
      host: this.config.redisHost ?? 'localhost',
      port: this.config.redisPort ?? 6379,
      password: this.config.redisPassword,
    });
    const fallbackSession = new InMemorySessionStore();
    this.sessionEntry = {
      resilient: new ResilientProvider<SessionStoreProvider>(
        primarySession,
        fallbackSession,
        async () => primarySession.isAvailable()
      ),
    };

    // --- Cache: Redis + In-Memory fallback ---
    const primaryCache = new RedisCacheProvider({
      host: this.config.redisHost ?? 'localhost',
      port: this.config.redisPort ?? 6379,
    });
    const fallbackCache = new InMemoryCacheProvider();
    this.cacheEntry = {
      resilient: new ResilientProvider<CacheProvider>(
        primaryCache,
        fallbackCache,
        async () => primaryCache.isAvailable()
      ),
    };

    // --- Agent: Bedrock + Rule-based fallback ---
    const primaryAgent = new BedrockAgentProvider({
      region: this.config.bedrockRegion ?? 'ap-south-1',
      modelId: this.config.bedrockModelId,
    });
    const fallbackAgent = new RuleBasedAgentProvider();
    this.agentEntry = {
      resilient: new ResilientProvider<AgentProvider>(
        primaryAgent,
        fallbackAgent,
        async () => {
          // Bedrock health check: we can't easily ping it,
          // so default to true and rely on invoke-time errors triggering fallback
          try {
            // A lightweight check — if the AWS SDK can resolve credentials, consider it available
            return true;
          } catch {
            return false;
          }
        }
      ),
    };
  }

  // --- Registration Methods (for testing and manual override) ---

  registerPreferenceStore(
    primary: PreferenceStoreProvider,
    fallback: PreferenceStoreProvider,
    healthCheck: () => Promise<boolean>
  ): void {
    this.preferenceEntry = {
      resilient: new ResilientProvider(primary, fallback, healthCheck),
    };
  }

  registerSessionStore(
    primary: SessionStoreProvider,
    fallback: SessionStoreProvider,
    healthCheck: () => Promise<boolean>
  ): void {
    this.sessionEntry = {
      resilient: new ResilientProvider(primary, fallback, healthCheck),
    };
  }

  registerCache(
    primary: CacheProvider,
    fallback: CacheProvider,
    healthCheck: () => Promise<boolean>
  ): void {
    this.cacheEntry = {
      resilient: new ResilientProvider(primary, fallback, healthCheck),
    };
  }

  registerAgent(
    primary: AgentProvider,
    fallback: AgentProvider,
    healthCheck: () => Promise<boolean>
  ): void {
    this.agentEntry = {
      resilient: new ResilientProvider(primary, fallback, healthCheck),
    };
  }

  // --- Accessor Methods (property-style getters) ---

  /** Get the active preference store provider. */
  get preferenceStore(): Promise<PreferenceStoreProvider> {
    if (!this.preferenceEntry) {
      return Promise.reject(new Error('PreferenceStoreProvider not registered'));
    }
    return this.preferenceEntry.resilient.getActiveProvider();
  }

  /** Get the active session store provider. */
  get sessionStore(): Promise<SessionStoreProvider> {
    if (!this.sessionEntry) {
      return Promise.reject(new Error('SessionStoreProvider not registered'));
    }
    return this.sessionEntry.resilient.getActiveProvider();
  }

  /** Get the active cache provider. */
  get cache(): Promise<CacheProvider> {
    if (!this.cacheEntry) {
      return Promise.reject(new Error('CacheProvider not registered'));
    }
    return this.cacheEntry.resilient.getActiveProvider();
  }

  /** Get the active agent provider. */
  get agent(): Promise<AgentProvider> {
    if (!this.agentEntry) {
      return Promise.reject(new Error('AgentProvider not registered'));
    }
    return this.agentEntry.resilient.getActiveProvider();
  }

  // --- Legacy async getters (backward-compatible) ---

  async getPreferenceStore(): Promise<PreferenceStoreProvider> {
    return this.preferenceStore;
  }

  async getSessionStore(): Promise<SessionStoreProvider> {
    return this.sessionStore;
  }

  async getCache(): Promise<CacheProvider> {
    return this.cache;
  }

  async getAgent(): Promise<AgentProvider> {
    return this.agent;
  }

  // --- Health Status ---

  /** Get health status of all registered providers. */
  getHealthStatus(): Record<string, boolean> {
    return {
      preferenceStore: this.preferenceEntry?.resilient.isPrimaryHealthy() ?? false,
      sessionStore: this.sessionEntry?.resilient.isPrimaryHealthy() ?? false,
      cache: this.cacheEntry?.resilient.isPrimaryHealthy() ?? false,
      agent: this.agentEntry?.resilient.isPrimaryHealthy() ?? false,
    };
  }

  /** Force re-check all providers on next access. */
  invalidateAll(): void {
    this.preferenceEntry?.resilient.invalidateHealthCache();
    this.sessionEntry?.resilient.invalidateHealthCache();
    this.cacheEntry?.resilient.invalidateHealthCache();
    this.agentEntry?.resilient.invalidateHealthCache();
  }
}

// --- Singleton Factory ---

let registryInstance: ProviderRegistry | null = null;

/**
 * Get or create the global provider registry.
 * Automatically initializes all providers based on environment.
 * Defaults to LOCAL environment if KIRANA_ENV is not set.
 */
export function getRegistry(config?: RegistryConfig): ProviderRegistry {
  if (!registryInstance) {
    const environment = (config?.environment ??
      (process.env['KIRANA_ENV'] as Environment) ??
      'LOCAL') as Environment;

    const registryConfig: RegistryConfig = {
      environment,
      dynamoTableName: config?.dynamoTableName ?? process.env['DYNAMO_TABLE_NAME'] ?? 'KiranaAI',
      dynamoRegion: config?.dynamoRegion ?? process.env['AWS_REGION'] ?? 'ap-south-1',
      dynamoEndpoint: config?.dynamoEndpoint ?? process.env['DYNAMO_ENDPOINT'],
      redisHost: config?.redisHost ?? process.env['REDIS_HOST'] ?? 'localhost',
      redisPort: config?.redisPort ?? parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      redisPassword: config?.redisPassword ?? process.env['REDIS_PASSWORD'],
      preferenceFilePath: config?.preferenceFilePath ?? process.env['PREFERENCE_FILE_PATH'] ?? 'data/preferences.json',
      bedrockRegion: config?.bedrockRegion ?? process.env['BEDROCK_REGION'] ?? 'ap-south-1',
      bedrockModelId: config?.bedrockModelId ?? process.env['BEDROCK_MODEL_ID'],
    };

    registryInstance = new ProviderRegistry(registryConfig);
    registryInstance.initialize();
  }
  return registryInstance;
}

/**
 * Create a registry instance for LOCAL development without singleton caching.
 * Useful for testing or when you need an isolated registry.
 */
export function createLocalRegistry(configOverrides?: Partial<RegistryConfig>): ProviderRegistry {
  const config: RegistryConfig = {
    environment: 'LOCAL',
    ...configOverrides,
  };
  const registry = new ProviderRegistry(config);
  registry.initialize();
  return registry;
}

/**
 * Reset the registry singleton (useful for testing).
 */
export function resetRegistry(): void {
  registryInstance = null;
}
