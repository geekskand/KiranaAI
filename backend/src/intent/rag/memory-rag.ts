/**
 * Memory RAG — stores and retrieves conversational knowledge about the user.
 *
 * Unlike the structured Preference Graph, Memory RAG holds free-text insights:
 * complaints, rejections, brand opinions, special instructions, shopping habits.
 *
 * Example stored memories:
 *   "User hates Mother Dairy milk."
 *   "User says almonds from Brand X were stale."
 *   "User avoids chocolates with palm oil."
 *   "User buys snacks only on weekends."
 */

import { SemanticStore } from '../semantic-store.js';

export type MemoryKind =
  | 'complaint'
  | 'rejection'
  | 'preference'
  | 'correction'
  | 'instruction'
  | 'opinion'
  | 'habit';

export interface MemoryMeta {
  kind: MemoryKind;
  category?: string;
  brand?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  timestamp: number;
}

export class MemoryRag {
  private stores = new Map<string, SemanticStore<MemoryMeta>>();

  private store(userId: string): SemanticStore<MemoryMeta> {
    let s = this.stores.get(userId);
    if (!s) {
      s = new SemanticStore<MemoryMeta>(`memory:${userId}`);
      this.stores.set(userId, s);
    }
    return s;
  }

  /** Persist a conversational insight. */
  remember(userId: string, text: string, meta: Omit<MemoryMeta, 'timestamp'>): void {
    const id = `mem-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.store(userId).upsert({ id, text, metadata: { ...meta, timestamp: Date.now() } });
  }

  /** Retrieve the most relevant memories for a query. */
  retrieve(userId: string, query: string, k = 5) {
    return this.store(userId).query(query, k);
  }

  /** Extract and store insights from a raw user message (heuristic NLU). */
  ingestMessage(userId: string, message: string): void {
    const lower = message.toLowerCase();

    // Negative sentiment / complaints / rejections
    const negative = /\b(hate|don't like|dont like|avoid|never|stale|bad|worst|dislike|allergic)\b/.test(lower);
    const positive = /\b(love|prefer|always|favorite|favourite|like|best|only)\b/.test(lower);

    if (negative) {
      this.remember(userId, message, {
        kind: lower.includes('avoid') || lower.includes('allergic') ? 'instruction' : 'complaint',
        sentiment: 'negative',
      });
    } else if (positive) {
      this.remember(userId, message, { kind: 'preference', sentiment: 'positive' });
    }

    // Habit detection
    if (/\b(weekend|weekday|monthly|weekly|every|usually)\b/.test(lower)) {
      this.remember(userId, message, { kind: 'habit', sentiment: 'neutral' });
    }
  }
}

/** Singleton instance. */
export const memoryRag = new MemoryRag();
