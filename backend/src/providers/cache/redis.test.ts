/**
 * Unit tests for RedisCacheProvider.
 *
 * Mocks the ioredis client to test cache logic without a running Redis instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCacheProvider } from './redis.js';

// Mock ioredis
vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ping: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
  }));
  return { default: MockRedis };
});

describe('RedisCacheProvider', () => {
  let provider: RedisCacheProvider;
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new RedisCacheProvider({ host: 'localhost', port: 6379 });
    mockClient = provider.getClient() as unknown as typeof mockClient;
  });

  describe('get', () => {
    it('returns parsed JSON value when key exists', async () => {
      const data = { name: 'Milk', price: 45 };
      mockClient.get.mockResolvedValue(JSON.stringify(data));

      const result = await provider.get<typeof data>('product:123');

      expect(mockClient.get).toHaveBeenCalledWith('kirana:cache:product:123');
      expect(result).toEqual(data);
    });

    it('returns null when key does not exist', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await provider.get('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when stored value is invalid JSON', async () => {
      mockClient.get.mockResolvedValue('not valid json {{{');

      const result = await provider.get('bad-data');

      expect(result).toBeNull();
    });

    it('uses key prefix for namespacing', async () => {
      mockClient.get.mockResolvedValue(null);

      await provider.get('test-key');

      expect(mockClient.get).toHaveBeenCalledWith('kirana:cache:test-key');
    });
  });

  describe('set', () => {
    it('stores value as JSON with default TTL of 900 seconds', async () => {
      mockClient.set.mockResolvedValue('OK');
      const value = { items: [1, 2, 3] };

      await provider.set('my-key', value);

      expect(mockClient.set).toHaveBeenCalledWith(
        'kirana:cache:my-key',
        JSON.stringify(value),
        'EX',
        900
      );
    });

    it('allows TTL override per-call', async () => {
      mockClient.set.mockResolvedValue('OK');

      await provider.set('short-lived', 'data', 60);

      expect(mockClient.set).toHaveBeenCalledWith(
        'kirana:cache:short-lived',
        JSON.stringify('data'),
        'EX',
        60
      );
    });

    it('uses custom default TTL from options', async () => {
      const customProvider = new RedisCacheProvider({ defaultTtlSeconds: 300 });
      const customClient = customProvider.getClient() as unknown as typeof mockClient;
      customClient.set.mockResolvedValue('OK');

      await customProvider.set('key', 'val');

      expect(customClient.set).toHaveBeenCalledWith(
        'kirana:cache:key',
        JSON.stringify('val'),
        'EX',
        300
      );
    });
  });

  describe('delete', () => {
    it('deletes the key with prefix', async () => {
      mockClient.del.mockResolvedValue(1);

      await provider.delete('old-key');

      expect(mockClient.del).toHaveBeenCalledWith('kirana:cache:old-key');
    });
  });

  describe('isAvailable', () => {
    it('returns true when PING succeeds', async () => {
      mockClient.ping.mockResolvedValue('PONG');

      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });

    it('returns false when PING fails', async () => {
      mockClient.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it('returns false when PING returns unexpected value', async () => {
      mockClient.ping.mockResolvedValue('NOT_PONG');

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('constructor options', () => {
    it('uses custom key prefix', async () => {
      const customProvider = new RedisCacheProvider({ keyPrefix: 'app:v2:' });
      const customClient = customProvider.getClient() as unknown as typeof mockClient;
      customClient.get.mockResolvedValue(null);

      await customProvider.get('test');

      expect(customClient.get).toHaveBeenCalledWith('app:v2:test');
    });
  });
});
