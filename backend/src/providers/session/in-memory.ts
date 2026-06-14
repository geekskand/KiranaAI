/**
 * In-Memory Session Store — fallback provider.
 *
 * Used when Redis/ElastiCache is unavailable (local development, demo mode).
 * Stores session data in a Map with deep-clone on read/write to prevent
 * shared reference mutations between callers.
 *
 * Requirements: 12.2
 */

import type { SessionStoreProvider } from '../interfaces.js';
import type { SessionContext } from '../../models/index.js';

/**
 * Deep-clone a value using structured clone.
 * Prevents mutations from leaking between stored data and caller references.
 */
function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemorySessionStore implements SessionStoreProvider {
  private store: Map<string, SessionContext> = new Map();

  /**
   * Retrieve an active session by ID.
   * Returns a deep clone to prevent external mutation of stored data.
   */
  async getSession(sessionId: string): Promise<SessionContext | null> {
    const session = this.store.get(sessionId);
    if (!session) {
      return null;
    }
    return deepClone(session);
  }

  /**
   * Persist session state (create or update).
   * Deep-clones the input to prevent the caller from mutating stored data.
   */
  async saveSession(sessionId: string, context: SessionContext): Promise<void> {
    this.store.set(sessionId, deepClone(context));
  }

  /**
   * Delete a session (e.g., on expiry or logout).
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  /**
   * Clear all sessions. Useful for testing.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of stored sessions. Useful for testing/monitoring.
   */
  get size(): number {
    return this.store.size;
  }
}
