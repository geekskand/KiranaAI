/**
 * Unit tests for In-Memory Session Store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySessionStore } from './in-memory.js';
import type { SessionContext } from '../../models/index.js';

function createTestSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'test-session-1',
    userId: 'user-123',
    conversationHistory: [
      { role: 'user', content: 'Hello', timestamp: Date.now() },
      { role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
    ],
    cartState: [
      { productId: 'prod-1', name: 'Milk', price: 50, quantity: 1 },
    ],
    agentReasoningHistory: [],
    suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

describe('InMemorySessionStore', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  describe('getSession', () => {
    it('returns null for non-existent session', async () => {
      const result = await store.getSession('non-existent');
      expect(result).toBeNull();
    });

    it('returns stored session data', async () => {
      const session = createTestSession();
      await store.saveSession('test-session-1', session);

      const result = await store.getSession('test-session-1');
      expect(result).toEqual(session);
    });

    it('returns a deep clone — mutating the result does not affect stored data', async () => {
      const session = createTestSession();
      await store.saveSession('test-session-1', session);

      const result = await store.getSession('test-session-1');
      result!.cartState.push({ productId: 'prod-2', name: 'Bread', price: 30, quantity: 1 });
      result!.conversationHistory.push({ role: 'user', content: 'Add bread', timestamp: Date.now() });

      const storedAgain = await store.getSession('test-session-1');
      expect(storedAgain!.cartState).toHaveLength(1);
      expect(storedAgain!.conversationHistory).toHaveLength(2);
    });
  });

  describe('saveSession', () => {
    it('stores a new session', async () => {
      const session = createTestSession();
      await store.saveSession('test-session-1', session);

      expect(store.size).toBe(1);
      const result = await store.getSession('test-session-1');
      expect(result).toEqual(session);
    });

    it('overwrites an existing session', async () => {
      const session1 = createTestSession({ userId: 'user-a' });
      const session2 = createTestSession({ userId: 'user-b' });

      await store.saveSession('test-session-1', session1);
      await store.saveSession('test-session-1', session2);

      const result = await store.getSession('test-session-1');
      expect(result!.userId).toBe('user-b');
      expect(store.size).toBe(1);
    });

    it('deep-clones on write — mutating the input after save does not affect stored data', async () => {
      const session = createTestSession();
      await store.saveSession('test-session-1', session);

      // Mutate the original object after saving
      session.cartState.push({ productId: 'prod-3', name: 'Eggs', price: 60, quantity: 2 });

      const stored = await store.getSession('test-session-1');
      expect(stored!.cartState).toHaveLength(1);
    });
  });

  describe('deleteSession', () => {
    it('removes a stored session', async () => {
      const session = createTestSession();
      await store.saveSession('test-session-1', session);

      await store.deleteSession('test-session-1');

      const result = await store.getSession('test-session-1');
      expect(result).toBeNull();
      expect(store.size).toBe(0);
    });

    it('does not throw when deleting a non-existent session', async () => {
      await expect(store.deleteSession('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('removes all sessions', async () => {
      await store.saveSession('s1', createTestSession({ sessionId: 's1' }));
      await store.saveSession('s2', createTestSession({ sessionId: 's2' }));

      expect(store.size).toBe(2);
      store.clear();
      expect(store.size).toBe(0);
    });
  });
});
