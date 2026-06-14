/**
 * Redis-backed Session Store provider (primary).
 *
 * Sessions are stored as JSON strings keyed by `session:<sessionId>`.
 * Redis provides natural concurrency safety through atomic GET/SET/DEL operations,
 * supporting concurrent multi-user access without data corruption.
 *
 * Requirements: 8.1, 8.3
 */

import type Redis from 'ioredis';
import { createRequire } from 'node:module';
import type { SessionStoreProvider } from '../interfaces.js';
import type { SessionContext } from '../../models/index.js';

/** Lazily load ioredis only when a Redis store is actually constructed. */
const requireCjs = createRequire(import.meta.url);
function loadRedis(): typeof Redis {
  const mod = requireCjs('ioredis');
  return (mod.default ?? mod) as typeof Redis;
}

/** Configuration options for the Redis session store. */
export interface RedisSessionStoreOptions {
  /** Redis connection URL or host. Defaults to 'localhost'. */
  host?: string;
  /** Redis port. Defaults to 6379. */
  port?: number;
  /** Redis password (optional). */
  password?: string;
  /** Session TTL in seconds. Defaults to 3600 (1 hour). */
  ttlSeconds?: number;
  /** Key prefix for session entries. Defaults to 'session:'. */
  keyPrefix?: string;
}

const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const DEFAULT_KEY_PREFIX = 'session:';

export class RedisSessionStore implements SessionStoreProvider {
  private readonly client: Redis;
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(options: RedisSessionStoreOptions = {}) {
    const {
      host = 'localhost',
      port = 6379,
      password,
      ttlSeconds = DEFAULT_TTL_SECONDS,
      keyPrefix = DEFAULT_KEY_PREFIX,
    } = options;

    this.ttlSeconds = ttlSeconds;
    this.keyPrefix = keyPrefix;

    const RedisCtor = loadRedis();
    this.client = new RedisCtor({
      host,
      port,
      password,
      // Disable offline queue so commands fail fast when disconnected
      enableOfflineQueue: false,
      // Reconnect with exponential backoff
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
  }

  /**
   * Build the Redis key for a given session ID.
   */
  private buildKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  /**
   * Retrieve an active session by ID.
   * Returns null if the session does not exist or has expired.
   */
  async getSession(sessionId: string): Promise<SessionContext | null> {
    const key = this.buildKey(sessionId);
    const data = await this.client.get(key);

    if (data === null) {
      return null;
    }

    return JSON.parse(data) as SessionContext;
  }

  /**
   * Persist session state (create or update).
   * Sets/resets the TTL on each save to keep active sessions alive.
   * Redis SET with EX is atomic, ensuring concurrent access safety.
   */
  async saveSession(sessionId: string, context: SessionContext): Promise<void> {
    const key = this.buildKey(sessionId);
    const data = JSON.stringify(context);

    // SET with EX (expiry in seconds) is atomic — safe for concurrent access
    await this.client.set(key, data, 'EX', this.ttlSeconds);
  }

  /**
   * Delete a session (e.g., on expiry or logout).
   * DEL is atomic in Redis.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = this.buildKey(sessionId);
    await this.client.del(key);
  }

  /**
   * Check if the Redis connection is healthy.
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
   * Get the underlying Redis client instance.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Gracefully close the Redis connection.
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
