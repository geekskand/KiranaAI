/**
 * Unit tests for InMemoryCacheProvider.
 *
 * Validates TTL-based expiration, basic CRUD operations,
 * and lazy eviction of expired entries.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryCacheProvider } from './in-memory.js';

describe('InMemoryCacheProvider', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get', () => {
    it('returns null for a non-existent key', async () => {
      const result = await cache.get('missing-key');
      expect(result).toBeNull();
    });

    it('returns the stored value for a valid key', async () => {
      await cache.set('greeting', 'hello', 60);
      const result = await cache.get<string>('greeting');
      expect(result).toBe('hello');
    });

    it('returns null and deletes the entry after TTL expires', async () => {
      await cache.set('temp', 'value', 10); // 10 second TTL

      // Advance time past the TTL
      vi.advanceTimersByTime(11_000);

      const result = await cache.get('temp');
      expect(result).toBeNull();
      expect(cache.size).toBe(0);
    });

    it('returns the value if TTL has not yet expired', async () => {
      await cache.set('temp', 'still-here', 10);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(9_000);

      const result = await cache.get<string>('temp');
      expect(result).toBe('still-here');
    });

    it('handles complex object values', async () => {
      const obj = { name: 'Atta', price: 45.5, labels: ['whole-wheat'] };
      await cache.set('product:1', obj, 60);

      const result = await cache.get<typeof obj>('product:1');
      expect(result).toEqual(obj);
    });
  });

  describe('set', () => {
    it('stores a value with the specified TTL', async () => {
      await cache.set('key', 'value', 30);
      expect(cache.size).toBe(1);

      const result = await cache.get<string>('key');
      expect(result).toBe('value');
    });

    it('overwrites existing value for the same key', async () => {
      await cache.set('key', 'first', 60);
      await cache.set('key', 'second', 60);

      const result = await cache.get<string>('key');
      expect(result).toBe('second');
      expect(cache.size).toBe(1);
    });

    it('uses default TTL of 900 seconds (15 minutes) when ttlSeconds is 0', async () => {
      await cache.set('default-ttl', 'value', 0);

      // Advance 14 minutes — should still be present
      vi.advanceTimersByTime(14 * 60 * 1000);
      expect(await cache.get<string>('default-ttl')).toBe('value');

      // Advance past 15 minutes total — should be expired
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(await cache.get('default-ttl')).toBeNull();
    });

    it('uses default TTL when no ttlSeconds argument is provided', async () => {
      await cache.set('no-ttl-arg', 'value', undefined as unknown as number);

      // Should use 900s default — still present at 899s
      vi.advanceTimersByTime(899_000);
      expect(await cache.get<string>('no-ttl-arg')).toBe('value');

      // Expired at 901s
      vi.advanceTimersByTime(2_000);
      expect(await cache.get('no-ttl-arg')).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes an existing entry', async () => {
      await cache.set('key', 'value', 60);
      await cache.delete('key');

      const result = await cache.get('key');
      expect(result).toBeNull();
      expect(cache.size).toBe(0);
    });

    it('does not throw when deleting a non-existent key', async () => {
      await expect(cache.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('removes all entries from the cache', async () => {
      await cache.set('a', 1, 60);
      await cache.set('b', 2, 60);
      await cache.set('c', 3, 60);

      expect(cache.size).toBe(3);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('custom default TTL', () => {
    it('respects a custom default TTL passed to the constructor', async () => {
      const shortCache = new InMemoryCacheProvider(5); // 5 second default

      await shortCache.set('short', 'lived', 0); // uses default TTL

      vi.advanceTimersByTime(4_000);
      expect(await shortCache.get<string>('short')).toBe('lived');

      vi.advanceTimersByTime(2_000);
      expect(await shortCache.get('short')).toBeNull();
    });
  });

  describe('lazy eviction', () => {
    it('does not remove expired entries until they are accessed', async () => {
      await cache.set('lazy', 'entry', 5);

      vi.advanceTimersByTime(10_000);

      // Entry is still in the map (not yet evicted)
      expect(cache.size).toBe(1);

      // Accessing it triggers eviction
      await cache.get('lazy');
      expect(cache.size).toBe(0);
    });
  });
});
