/**
 * Unit tests for RedisSessionStore.
 *
 * Mocks the ioredis client to validate session store logic
 * (key construction, JSON serialization, TTL, and CRUD operations).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionContext } from '../../models/index.js';

// Mock ioredis before importing the store
vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
  }));
  return { default: MockRedis };
});

import { RedisSessionStore } from './redis.js';

function createMockSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'sess-123',
    userId: 'user-abc',
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

describe('RedisSessionStore', () => {
  let store: RedisSessionStore;
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    store = new RedisSessionStore({ ttlSeconds: 3600 });
    mockClient = store.getClient() as unknown as typeof mockClient;
  });

  describe('getSession', () => {
    it('should return null when session does not exist', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await store.getSession('nonexistent');

      expect(result).toBeNull();
      expect(mockClient.get).toHaveBeenCalledWith('session:nonexistent');
    });

    it('should return deserialized SessionContext when session exists', async () => {
      const session = createMockSession();
      mockClient.get.mockResolvedValue(JSON.stringify(session));

      const result = await store.getSession('sess-123');

      expect(result).toEqual(session);
      expect(mockClient.get).toHaveBeenCalledWith('session:sess-123');
    });

    it('should preserve complex session data through serialization', async () => {
      const session = createMockSession({
        conversationHistory: [
          { role: 'user', content: 'hello', timestamp: 1000 },
          { role: 'assistant', content: 'hi there!', timestamp: 1001 },
        ],
        cartState: [
          { productId: 'prod-1', name: 'Milk', price: 50, quantity: 2 },
        ],
        onboardingState: {
          questionsAsked: 2,
          questionsTotal: 5,
          answers: { diet: 'vegetarian' },
          complete: false,
        },
      });
      mockClient.get.mockResolvedValue(JSON.stringify(session));

      const result = await store.getSession('sess-123');

      expect(result).toEqual(session);
    });
  });

  describe('saveSession', () => {
    it('should serialize and store session with TTL', async () => {
      const session = createMockSession();
      mockClient.set.mockResolvedValue('OK');

      await store.saveSession('sess-123', session);

      expect(mockClient.set).toHaveBeenCalledWith(
        'session:sess-123',
        JSON.stringify(session),
        'EX',
        3600
      );
    });

    it('should use custom TTL when configured', async () => {
      const customStore = new RedisSessionStore({ ttlSeconds: 7200 });
      const customClient = customStore.getClient() as unknown as typeof mockClient;
      customClient.set.mockResolvedValue('OK');

      const session = createMockSession();
      await customStore.saveSession('sess-456', session);

      expect(customClient.set).toHaveBeenCalledWith(
        'session:sess-456',
        JSON.stringify(session),
        'EX',
        7200
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete the session key from Redis', async () => {
      mockClient.del.mockResolvedValue(1);

      await store.deleteSession('sess-123');

      expect(mockClient.del).toHaveBeenCalledWith('session:sess-123');
    });

    it('should not throw when deleting a nonexistent session', async () => {
      mockClient.del.mockResolvedValue(0);

      await expect(store.deleteSession('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return true when Redis responds with PONG', async () => {
      mockClient.ping.mockResolvedValue('PONG');

      const result = await store.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when Redis ping fails', async () => {
      mockClient.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await store.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('key prefix', () => {
    it('should use default key prefix "session:"', async () => {
      mockClient.get.mockResolvedValue(null);

      await store.getSession('abc');

      expect(mockClient.get).toHaveBeenCalledWith('session:abc');
    });

    it('should support custom key prefix', async () => {
      const customStore = new RedisSessionStore({ keyPrefix: 'sess:v2:' });
      const customClient = customStore.getClient() as unknown as typeof mockClient;
      customClient.get.mockResolvedValue(null);

      await customStore.getSession('xyz');

      expect(customClient.get).toHaveBeenCalledWith('sess:v2:xyz');
    });
  });

  describe('disconnect', () => {
    it('should call quit on the Redis client', async () => {
      mockClient.quit.mockResolvedValue('OK');

      await store.disconnect();

      expect(mockClient.quit).toHaveBeenCalled();
    });
  });
});
