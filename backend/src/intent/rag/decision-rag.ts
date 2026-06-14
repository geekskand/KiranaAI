/**
 * Decision Memory RAG — stores shopping decisions and their outcomes.
 *
 * Every accepted or rejected recommendation becomes training context, making
 * KiranaAI's recommendations sharper over time.
 *
 * Example:
 *   category: sugar, rejected: Tata, accepted: Generic, reason: price_sensitive
 */

import { SemanticStore } from '../semantic-store.js';

export interface DecisionMeta {
  category: string;
  brand?: string;
  outcome: 'accepted' | 'rejected';
  reason?: string;
  timestamp: number;
}

export class DecisionRag {
  private stores = new Map<string, SemanticStore<DecisionMeta>>();

  private store(userId: string): SemanticStore<DecisionMeta> {
    let s = this.stores.get(userId);
    if (!s) {
      s = new SemanticStore<DecisionMeta>(`decision:${userId}`);
      this.stores.set(userId, s);
    }
    return s;
  }

  /** Record an accept/reject decision. */
  record(
    userId: string,
    decision: { category: string; brand?: string; outcome: 'accepted' | 'rejected'; reason?: string }
  ): void {
    const text = `In ${decision.category}, ${decision.outcome} ${decision.brand ?? 'item'}${
      decision.reason ? ` because ${decision.reason}` : ''
    }`;
    const id = `dec-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.store(userId).upsert({ id, text, metadata: { ...decision, timestamp: Date.now() } });
  }

  /** Retrieve relevant past decisions for a query. */
  retrieve(userId: string, query: string, k = 5) {
    return this.store(userId).query(query, k);
  }

  /** Aggregate accepted/rejected brands for a category. */
  brandsFor(userId: string, category: string): { accepted: string[]; rejected: string[]; priceSensitive: boolean } {
    const docs = this.store(userId).all() as Array<{ metadata?: DecisionMeta }>;
    const accepted = new Set<string>();
    const rejected = new Set<string>();
    let priceSensitive = false;
    for (const d of docs) {
      const m = d.metadata;
      if (!m || m.category !== category) continue;
      if (m.brand) {
        if (m.outcome === 'accepted') accepted.add(m.brand);
        else rejected.add(m.brand);
      }
      if (m.reason === 'price_sensitive') priceSensitive = true;
    }
    return { accepted: [...accepted], rejected: [...rejected], priceSensitive };
  }
}

export const decisionRag = new DecisionRag();
