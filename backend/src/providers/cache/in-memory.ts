/**
 * In-Memory Cache Provider — fallback implementation.
 *
 * Used when Redis/ElastiCache is unavailable (local development, demo mode).
 * Stores entries in a Map with timestamp-based TTL expiration.
 * Expired entries are lazily evicted on access (get).
 *
 * Default TTL: 15 minutes (900 seconds).
 *
 * Requirements: 12.3
 */

import type { CacheProvider } from '../interfaces.js';

/** Default TTL for cached entries: 15 minutes in seconds. */
const DEFAULT_TTL_SECONDS = 900;

/** Internal cache entry with value and expiration timestamp. */
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-memory implementation of CacheProvider with TTL-based expiration.
 *
 * Entries are stored with an absolute expiration timestamp. On `get`, if the
 * entry's `expiresAt` has passed, it is deleted and null is returned (lazy eviction).
 */
export class InMemoryCacheProvider implements CacheProvider {
  private store: Map<string, CacheEntry> = new Map();
  private readonly defaultTtl: number;

  constructor(defaultTtlSeconds: number = DEFAULT_TTL_SECONDS) {
    this.defaultTtl = defaultTtlSeconds;
  }

  /**
   * Get a cached value by key.
   * Returns null if the key doesn't exist or has expired.
   * Expired entries are lazily deleted on access.
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set a value in the cache with a TTL in seconds.
   * If ttlSeconds is 0 or not provided, uses the default (900s / 15 minutes).
   */
  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTtl): Promise<void> {
    const ttl = ttlSeconds || this.defaultTtl;
    const expiresAt = Date.now() + ttl * 1000;

    this.store.set(key, { value, expiresAt });
  }

  /**
   * Delete a cached entry by key.
   */
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Clear all cached entries. Useful for testing.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of entries currently in the store (including potentially expired ones).
   * Useful for testing/monitoring.
   */
  get size(): number {
    return this.store.size;
  }
}
