/**
 * Context Fusion Engine — merges every knowledge source into a single unified
 * context object. The Decision Intelligence Agent consumes ONLY this fused
 * context; it never queries individual systems directly.
 */

import type { FusedContext, UnderstoodIntent, RetrievalResult } from './types.js';
import type { UserProfile, CartItem, Product, DietaryFlag } from '../models/types.js';
import { decisionRag } from './rag/decision-rag.js';
import { memoryRag } from './rag/memory-rag.js';
import { sessionRag } from './rag/session-rag.js';
import { productRag } from './rag/product-rag.js';

export interface FusionInputs {
  userId: string;
  sessionId: string;
  intent: UnderstoodIntent;
  retrieval: RetrievalResult;
  profile: UserProfile | null;
  cart: CartItem[];
  freeDeliveryThreshold: number;
}

function inferCategoryFromCandidates(candidates: Product[]): string | undefined {
  return candidates[0]?.category;
}

export function fuseContext(inputs: FusionInputs): FusedContext {
  const { userId, sessionId, intent, retrieval, profile, cart, freeDeliveryThreshold } = inputs;

  // Resolve candidate products from the product fragments / direct search.
  const candidateIds = retrieval.fragments
    .filter((f) => f.source === 'product' && f.metadata?.['productId'])
    .map((f) => String(f.metadata!['productId']));
  let candidates: Product[] = candidateIds
    .map((id) => productRag.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (candidates.length === 0 && intent.entity) {
    candidates = productRag.search(intent.entity, 4);
  }

  const category = inferCategoryFromCandidates(candidates);

  // Preference signals
  const dietaryFlags: DietaryFlag[] = profile?.dietaryFlags ?? [];
  let preferredBrand: string | undefined;
  if (profile && category) {
    const loyalties = profile.brandLoyalty
      .filter((b) => b.category === category)
      .sort((a, b) => b.score - a.score);
    preferredBrand = loyalties[0]?.brand;
  }

  // Learned signals from Decision Memory
  const decisionSignals = category
    ? decisionRag.brandsFor(userId, category)
    : { accepted: [], rejected: [], priceSensitive: false };

  // Price sensitivity: from decision history OR from the profile's quality
  // preference (high priceWeight) for this category.
  let priceSensitive = decisionSignals.priceSensitive;
  if (profile && category) {
    const qp = profile.qualityPreferences.find((q) => q.category === category);
    if (qp && qp.priceWeight >= 0.7) priceSensitive = true;
  }

  // Memory insights (free-text)
  const memoryInsights = memoryRag.retrieve(userId, intent.entity ?? intent.rawText, 4).map((d) => d.text);

  // Avoided brands derived from memory (negative sentiment + brand mention)
  const avoidedBrands: string[] = [];
  for (const d of memoryRag.retrieve(userId, intent.entity ?? intent.rawText, 6)) {
    const m = d.metadata;
    if (m?.sentiment === 'negative' && m.brand) avoidedBrands.push(m.brand);
  }

  // Session signals
  const recentItems = sessionRag.recentItems(sessionId, 5);

  // Commerce signals
  const cartValue = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryGap = Math.max(0, freeDeliveryThreshold - cartValue);

  // Usual quantity from preferences (best-effort)
  const usualQuantity = undefined;

  return {
    userId,
    query: intent.entity ?? intent.rawText,
    intent,
    preferredBrand,
    avoidedBrands: [...new Set(avoidedBrands)],
    dietaryFlags,
    usualQuantity,
    priceSensitive,
    rejectedBrands: decisionSignals.rejected,
    acceptedBrands: decisionSignals.accepted,
    memoryInsights,
    recentItems,
    cartValue,
    deliveryGap,
    freeDeliveryThreshold,
    candidates,
    fragments: retrieval.fragments,
  };
}
