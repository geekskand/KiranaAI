/**
 * Intent Engine — core type definitions.
 *
 * The Intent Engine is the brain of KiranaAI. It transforms a raw user query
 * into judgment: Intent → Retrieval Planning → Multi-RAG Retrieval →
 * Context Fusion → Decision Intelligence → Action Planning → Execution.
 */

import type { Product, ProductCard, DietaryFlag } from '../models/types.js';

// ─── Intent ──────────────────────────────────────────────────────────────────

export type IntentKind =
  | 'add'
  | 'search'
  | 'substitute'
  | 'remove'
  | 'question'
  | 'greeting'
  | 'help'
  | 'plan'
  | 'unknown';

export interface UnderstoodIntent {
  kind: IntentKind;
  /** The product/category/topic the user referenced. */
  entity?: string;
  /** Raw confidence in the intent classification (0-1). */
  confidence: number;
  /** Original message text. */
  rawText: string;
}

// ─── Retrieval ─────────────────────────────────────────────────────────────────

export type RetrievalSource =
  | 'preference'
  | 'memory'
  | 'decision'
  | 'session'
  | 'product'
  | 'household'
  | 'pricing'
  | 'inventory';

export interface RetrievalPlan {
  /** Ordered set of sources to query for this request. */
  sources: RetrievalSource[];
  /** The query string used for semantic retrieval. */
  query: string;
  /** Reason each source was chosen (for explainability). */
  rationale: Record<string, string>;
}

/** A single retrieved knowledge fragment with a relevance score. */
export interface RetrievedFragment {
  source: RetrievalSource;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RetrievalResult {
  plan: RetrievalPlan;
  fragments: RetrievedFragment[];
}

// ─── Fused Context ─────────────────────────────────────────────────────────────

export interface FusedContext {
  userId: string;
  query: string;
  intent: UnderstoodIntent;

  // Preference signals
  preferredBrand?: string;
  avoidedBrands: string[];
  dietaryFlags: DietaryFlag[];
  usualQuantity?: string;

  // Learned signals
  priceSensitive: boolean;
  rejectedBrands: string[];
  acceptedBrands: string[];

  // Preference Graph edge weights (the per-brand affinity for the resolved
  // category) and recency, used by the Decision Score algorithm.
  brandAffinity: Record<string, number>;   // brand -> loyalty 0..1 (edge weight)
  brandRecency: Record<string, number>;    // brand -> recency 0..1 (newer = higher)

  // Memory signals (free-text insights)
  memoryInsights: string[];

  // Session signals
  recentItems: string[];

  // Commerce signals
  cartValue: number;
  deliveryGap: number;
  freeDeliveryThreshold: number;
  cartProductIds: string[];                 // for basket-context affinity

  // Candidate products from product intelligence
  candidates: Product[];

  // Raw fragments for traceability
  fragments: RetrievedFragment[];
}

// ─── Decision ────────────────────────────────────────────────────────────────

export type DecisionAction = 'ACT' | 'ASK' | 'SHORTLIST' | 'SUBSTITUTE' | 'PREDICT';

export interface Decision {
  action: DecisionAction;
  /** Natural-language response for the user. */
  message: string;
  /** Products to surface (cards). */
  products: ProductCard[];
  /** If ASK: the single highest-priority question. */
  question?: string;
  /** Confidence in the decision (0-1). */
  confidence: number;
  /** Explainability trace. */
  reasoning: string[];
}

// ─── Predictions ───────────────────────────────────────────────────────────────

export interface Prediction {
  productId: string;
  name: string;
  reason: string;
  confidence: number;
}
