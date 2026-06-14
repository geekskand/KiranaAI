/**
 * Property-Based Test: Price Cache TTL Expiration (Property 14)
 *
 * For any product price stored in the Price Cache, after the TTL has elapsed,
 * the cached entry SHALL be considered expired and the next read SHALL return null
 * (lazy eviction in the in-memory fallback).
 *
 * **Validates: Requirements 9.1, 9.2**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { InMemoryCacheProvider } from './in-memory.js';

describe('Property 14: Price Cache TTL Expiration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('for any key/value/TTL: value is accessible before TTL, null after TTL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.record({
            name: fc.string(),
            price: fc.integer({ min: 1, max: 100000 }),
          })
        ),
        fc.integer({ min: 1, max: 3600 }),
        async (key, value, ttlSeconds) => {
          // Reset time to a fixed base for each iteration
          vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

          const cache = new InMemoryCacheProvider();

          // Write entry with given TTL
          await cache.set(key, value, ttlSeconds);

          // Entry should be readable immediately (before TTL expires)
          const beforeExpiry = await cache.get(key);
          expect(beforeExpiry).toEqual(value);

          // Advance time past the TTL
          vi.advanceTimersByTime(ttlSeconds * 1000 + 1);

          // Entry should be null after TTL expires (lazy eviction)
          const afterExpiry = await cache.get(key);
          expect(afterExpiry).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: entry present at TTL - 1ms, expired at TTL + 1ms', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.record({
            name: fc.string(),
            price: fc.integer({ min: 1, max: 100000 }),
          })
        ),
        fc.integer({ min: 1, max: 3600 }),
        async (key, value, ttlSeconds) => {
          // Reset time to a fixed base for each iteration
          vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

          const cache = new InMemoryCacheProvider();

          // Write entry
          await cache.set(key, value, ttlSeconds);

          const ttlMs = ttlSeconds * 1000;

          // Advance to exactly TTL - 1ms: entry should still be present
          vi.advanceTimersByTime(ttlMs - 1);
          const atBoundaryBefore = await cache.get(key);
          expect(atBoundaryBefore).toEqual(value);

          // Advance 2 more ms to reach TTL + 1ms: entry should be expired
          vi.advanceTimersByTime(2);
          const atBoundaryAfter = await cache.get(key);
          expect(atBoundaryAfter).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
