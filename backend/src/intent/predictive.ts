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

/**
 * Category-level co-occurrence: which companion categories pair with a given
 * category. Works for ANY product in the category (curated or generated),
 * unlike the product-ID-specific rules.
 */
const CATEGORY_COMPANIONS: Record<string, { category: string; prefer?: string; reason: string }[]> = {
  bread: [
    { category: 'dairy', prefer: 'butter', reason: 'Butter pairs perfectly with bread' },
    { category: 'sugar', prefer: 'honey', reason: 'Honey or jam for your bread' },
  ],
  rice: [
    { category: 'dal', reason: 'Dal and rice, a classic combo' },
    { category: 'spices', reason: 'Spices to cook your rice dish' },
  ],
  dal: [
    { category: 'rice', reason: 'Rice goes with dal' },
    { category: 'spices', prefer: 'turmeric', reason: 'Tadka spices for the dal' },
  ],
  milk: [
    { category: 'beverages', prefer: 'tea', reason: 'Tea or coffee for your milk' },
    { category: 'sugar', reason: 'A sweetener to go with it' },
  ],
  beverages: [
    { category: 'sugar', reason: 'Sugar for your tea or coffee' },
    { category: 'snacks', prefer: 'biscuit', reason: 'A snack to go with your drink' },
  ],
  vegetables: [
    { category: 'cooking_oil', reason: 'Oil to cook your vegetables' },
    { category: 'spices', reason: 'Spices for the sabzi' },
  ],
  cooking_oil: [
    { category: 'vegetables', reason: 'Fresh vegetables to cook' },
    { category: 'spices', reason: 'Spices to complete the dish' },
  ],
  flour: [
    { category: 'cooking_oil', reason: 'Oil for making rotis or puris' },
    { category: 'dairy', prefer: 'ghee', reason: 'Ghee or butter for your rotis' },
  ],
  snacks: [{ category: 'beverages', prefer: 'tea', reason: 'A drink to go with your snack' }],
  chocolate: [{ category: 'beverages', prefer: 'coffee', reason: 'Pairs well with coffee' }],
  spices: [{ category: 'cooking_oil', reason: 'Oil to cook with these spices' }],
};

/** Resolve a cart item's category from the catalog. */
function categoryOf(item: CartItem): string | undefined {
  return productRag.get(item.productId)?.category;
}

/** Cheapest in-stock product in a category (preferring a name keyword) not in cart. */
function pickFromCategory(
  category: string,
  inCart: Set<string>,
  seen: Set<string>,
  prefer?: string
): CatalogProduct | undefined {
  const available = productRag
    .inCategory(category)
    .filter((p) => p.inStock && !inCart.has(p.productId) && !seen.has(p.productId));
  if (prefer) {
    const matched = available
      .filter((p) => p.name.toLowerCase().includes(prefer))
      .sort((a, b) => a.price - b.price)[0];
    if (matched) return matched;
  }
  return available.sort((a, b) => a.price - b.price)[0];
}

/** Predict complementary items based on current cart contents (co-occurrence). */
export function predictBasketCompletions(cart: CartItem[], max = 2): Prediction[] {
  const inCart = new Set(cart.map((i) => i.productId));
  const seen = new Set<string>();
  const predictions: Prediction[] = [];

  // 1. Exact product-ID co-occurrence rules (curated items) take priority.
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

  // 2. Category-level companions (works for any product, incl. generated SKUs).
  for (const item of cart) {
    const cat = categoryOf(item);
    if (!cat) continue;
    const companions = CATEGORY_COMPANIONS[cat];
    if (!companions) continue;
    for (const comp of companions) {
      const product = pickFromCategory(comp.category, inCart, seen, comp.prefer);
      if (!product) continue;
      seen.add(product.productId);
      predictions.push({
        productId: product.productId,
        name: product.name,
        reason: comp.reason,
        confidence: 0.75,
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
