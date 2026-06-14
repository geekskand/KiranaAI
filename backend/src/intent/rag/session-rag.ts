/**
 * Session Memory RAG — tracks active conversation context.
 *
 * Enables anaphora resolution and short-term recall within a session:
 *   "Add milk" → "Add eggs" → "Remove the second one" (= eggs)
 *
 * Session memory persists for the duration of the shopping session.
 */

import { SemanticStore } from '../semantic-store.js';

export interface SessionEvent {
  type: 'mention' | 'add' | 'remove' | 'query';
  productId?: string;
  name?: string;
  timestamp: number;
}

interface SessionState {
  store: SemanticStore;
  /** Ordered list of items referenced this session (most recent last). */
  itemTimeline: { productId?: string; name: string; timestamp: number }[];
}

class SessionRag {
  private sessions = new Map<string, SessionState>();

  private state(sessionId: string): SessionState {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = { store: new SemanticStore(`session:${sessionId}`), itemTimeline: [] };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  /** Record a session event. */
  record(sessionId: string, event: SessionEvent): void {
    const s = this.state(sessionId);
    const text = `${event.type} ${event.name ?? ''}`.trim();
    s.store.upsert({
      id: `sess-${sessionId}-${event.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      metadata: { ...event },
    });
    if ((event.type === 'mention' || event.type === 'add') && event.name) {
      s.itemTimeline.push({ productId: event.productId, name: event.name, timestamp: event.timestamp });
    }
  }

  /** Resolve ordinal/anaphoric references like "the second one", "the last one". */
  resolveReference(sessionId: string, text: string): { productId?: string; name: string } | undefined {
    const timeline = this.state(sessionId).itemTimeline;
    if (timeline.length === 0) return undefined;
    const lower = text.toLowerCase();

    if (/\b(last|previous|that)\b/.test(lower)) return timeline[timeline.length - 1];
    if (/\bfirst\b/.test(lower)) return timeline[0];
    if (/\bsecond\b/.test(lower)) return timeline[1];
    if (/\bthird\b/.test(lower)) return timeline[2];
    if (/\b(it|one)\b/.test(lower)) return timeline[timeline.length - 1];
    return undefined;
  }

  /** Recently referenced item names. */
  recentItems(sessionId: string, limit = 5): string[] {
    return this.state(sessionId)
      .itemTimeline.slice(-limit)
      .map((i) => i.name);
  }

  retrieve(sessionId: string, query: string, k = 5) {
    return this.state(sessionId).store.query(query, k);
  }
}

export const sessionRag = new SessionRag();
