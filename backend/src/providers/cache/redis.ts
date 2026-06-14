/**
 * Redis-backed CacheProvider implementation.
 *
 * Uses ioredis to connect to ElastiCache Redis (or local Redis).
 * Stores values as JSON strings with Redis TTL (EX option).
 * Default TTL: 15 minutes (900 seconds).
 *
 * Requirements: 9.1, 9.2
 */

import type Redis from 'ioredis';
import { createRequire } from 'node:module';
import type { CacheProvider } from '../interfaces.js';

/** Lazily load ioredis only when a Redis cache is actually constructed. */
const requireCjs = createRequire(import.meta.url);
function loadRedis(): typeof Redis {
  const mod = requireCjs('ioredis');
  return (mod.default ?? mod) as typeof Redis;
}

/** Default TTL for cached entries: 15 minutes in seconds. */
const DEFAULT_TTL_SECONDS = 900;

export interface RedisCacheOptions {
  /** Redis connection URL (e.g., redis://localhost:6379). */
  url?: string;
  /** Redis host. Default: localhost. */
  host?: string;
  /** Redis port. Default: 6379. */
  port?: number;
  /** Key prefix to namespace cache entries. Default: 'kirana:cache:'. */
  keyPrefix?: string;
  /** Default TTL in seconds. Default: 900 (15 minutes). */
  defaultTtlSeconds?: number;
}

/**
 * Redis implementation of CacheProvider.
 *
 * Serializes values to JSON for storage and deserializes on retrieval.
 * Supports per-call TTL override with a 15-minute default.
 */
export class RedisCacheProvider implements CacheProvider {
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly defaultTtl: number;

  constructor(options: RedisCacheOptions = {}) {
    const {
      url,
      host = 'localhost',
      port = 6379,
      keyPrefix = 'kirana:cache:',
      defaultTtlSeconds = DEFAULT_TTL_SECONDS,
    } = options;

    const RedisCtor = loadRedis();
    if (url) {
      this.client = new RedisCtor(url, { lazyConnect: true });
    } else {
      this.client = new RedisCtor({ host, port, lazyConnect: true });
    }

    this.keyPrefix = keyPrefix;
    this.defaultTtl = defaultTtlSeconds;
  }

  /**
   * Get a cached value by key. Returns null if the key doesn't exist or has expired.
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.keyPrefix + key;
    const raw = await this.client.get(fullKey);

    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      // If stored value isn't valid JSON, treat as missing
      return null;
    }
  }

  /**
   * Set a value in the cache with a TTL in seconds.
   * Uses Redis EX option for server-side expiration.
   * If ttlSeconds is 0 or not provided, uses the default (900s / 15 minutes).
   */
  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTtl): Promise<void> {
    const fullKey = this.keyPrefix + key;
    const serialized = JSON.stringify(value);
    const ttl = ttlSeconds || this.defaultTtl;

    await this.client.set(fullKey, serialized, 'EX', ttl);
  }

  /**
   * Delete a cached entry by key.
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.client.del(fullKey);
  }

  /**
   * Check if the Redis connection is available and healthy.
   * Useful for health checks and the ResilientProvider pattern.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Connect to Redis. Call this before using the cache if lazyConnect is enabled.
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Disconnect from Redis gracefully.
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Get the underlying ioredis client instance.
   */
  getClient(): Redis {
    return this.client;
  }
}
