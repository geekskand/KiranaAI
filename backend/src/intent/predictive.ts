/**
 * Predictive Intent Engine — proactively infers what the user is about to need.
 *
 * Derives predictions from basket patterns (co-occurrence), cart-to-threshold
 * gap, and decision history. Predictions feed the "PREDICT" decision path so
 * KiranaAI behaves like a shopkeeper who anticipates needs.
 */

import type { Prediction } from './types.js';
import type { CartItem } from '../models/types.js';
import { coOccurrenceRules, catalog, type CatalogProduct } from '../seed/catalog.js';
import { productRag } from './rag/product-rag.js';

/** Predict complementary items based on current cart contents (co-occurrence). */
export function predictBasketCompletions(cart: CartItem[], max = 2): Prediction[] {
  const inCart = new Set(cart.map((i) => i.productId));
  const seen = new Set<string>();
  const predictions: Prediction[] = [];

  for (const item of cart) {
    const rule = coOccurrenceRules.find((r) => r.triggerProductId === item.productId);
    if (!rule) continue;
    for (const companion of rule.companions) {
      if (inCart.has(companion.productId) || seen.has(companion.productId)) continue;
      seen.add(companion.productId);
      predictions.push({
        productId: companion.productId,
        name: companion.name,
        reason: companion.reason,
        confidence: companion.frequency,
      });
      if (predictions.length >= max) return predictions;
    }
  }
  return predictions;
}

/** Predict a gap-fill item to reach the free delivery threshold. */
export function predictGapFill(
  cart: CartItem[],
  freeDeliveryThreshold: number
): Prediction | null {
  const cartValue = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const gap = freeDeliveryThreshold - cartValue;
  if (gap <= 0) return null;

  const inCart = new Set(cart.map((i) => i.productId));
  // Find a useful staple priced to close the gap (slight overshoot allowed).
  const candidate = catalog
    .filter((p) => !inCart.has(p.productId) && p.price >= gap && p.price <= gap + 40)
    .sort((a, b) => a.price - b.price)[0];

  if (!candidate) return null;
  return {
    productId: candidate.productId,
    name: candidate.name,
    reason: `You're ₹${gap} from free delivery`,
    confidence: 0.7,
  };
}

/** Build a "usual basket" plan prediction (for plan intents). */
export function predictUsualBasket(acceptedCategories: string[], max = 5): CatalogProduct[] {
  const picks: CatalogProduct[] = [];
  for (const cat of acceptedCategories) {
    const p = productRag.inCategory(cat).sort((a, b) => a.price - b.price)[0];
    if (p) picks.push(p);
    if (picks.length >= max) break;
  }
  return picks;
}
