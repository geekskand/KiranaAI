/**
 * Household Knowledge RAG — per-household member preferences.
 *
 * Architecture is in place now; full multi-member orchestration is part of the
 * post-MVP roadmap (Year 2 "Household mode"). Stores member-level facts:
 *   "Dad prefers Tata Tea", "Mom avoids sugar", "Child likes Bournvita",
 *   "Pet consumes Pedigree".
 *
 * Queries like "prepare next week's groceries" can fuse household knowledge.
 */

import { SemanticStore } from '../semantic-store.js';

export interface HouseholdMeta {
  member: string;
  category?: string;
  brand?: string;
  sentiment: 'positive' | 'negative';
  timestamp: number;
}

class HouseholdRag {
  private stores = new Map<string, SemanticStore<HouseholdMeta>>();

  private store(householdId: string): SemanticStore<HouseholdMeta> {
    let s = this.stores.get(householdId);
    if (!s) {
      s = new SemanticStore<HouseholdMeta>(`household:${householdId}`);
      this.stores.set(householdId, s);
    }
    return s;
  }

  addFact(
    householdId: string,
    fact: { member: string; text: string; category?: string; brand?: string; sentiment: 'positive' | 'negative' }
  ): void {
    const id = `hh-${householdId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.store(householdId).upsert({
      id,
      text: `${fact.member}: ${fact.text}`,
      metadata: {
        member: fact.member,
        category: fact.category,
        brand: fact.brand,
        sentiment: fact.sentiment,
        timestamp: Date.now(),
      },
    });
  }

  retrieve(householdId: string, query: string, k = 5) {
    return this.store(householdId).query(query, k);
  }
}

export const householdRag = new HouseholdRag();
