/**
 * Basket Completion Engine — rule-based co-occurrence suggestions.
 *
 * Uses hard-coded co-occurrence rules for the 50-SKU catalog to identify
 * complementary products based on cart contents. Enforces a maximum of
 * 2 suggestions per session via SessionContext.suggestionsGiven.basketCompletion.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import type {
  CartItem,
  Product,
  ProductSuggestion,
  SessionContext,
} from '../models/index.js';

// ─── Co-occurrence Rules ─────────────────────────────────────────────────────

export interface CoOccurrenceRule {
  /** Product name (trigger) */
  trigger: string;
  /** Companion product names with frequency scores */
  companions: { name: string; frequency: number; reason: string }[];
}

/**
 * Hard-coded co-occurrence rules for the 50-SKU catalog.
 * Each rule maps a trigger product to its companions sorted by frequency.
 */
export const CO_OCCURRENCE_RULES: CoOccurrenceRule[] = [
  {
    trigger: 'Milk',
    companions: [
      { name: 'Bread', frequency: 0.85, reason: 'Often bought with Milk' },
      { name: 'Butter', frequency: 0.72, reason: 'Often bought with Milk' },
      { name: 'Sugar', frequency: 0.60, reason: 'Often bought with Milk' },
    ],
  },
  {
    trigger: 'Bread',
    companions: [
      { name: 'Jam', frequency: 0.80, reason: 'Often bought with Bread' },
      { name: 'Butter', frequency: 0.78, reason: 'Often bought with Bread' },
      { name: 'Eggs', frequency: 0.55, reason: 'Often bought with Bread' },
    ],
  },
  {
    trigger: 'Rice',
    companions: [
      { name: 'Dal', frequency: 0.90, reason: 'Often bought with Rice' },
      { name: 'Oil', frequency: 0.75, reason: 'Often bought with Rice' },
      { name: 'Salt', frequency: 0.50, reason: 'Often bought with Rice' },
    ],
  },
  {
    trigger: 'Tea',
    companions: [
      { name: 'Sugar', frequency: 0.88, reason: 'Often bought with Tea' },
      { name: 'Milk', frequency: 0.85, reason: 'Often bought with Tea' },
      { name: 'Biscuits', frequency: 0.60, reason: 'Often bought with Tea' },
    ],
  },
  {
    trigger: 'Eggs',
    companions: [
      { name: 'Bread', frequency: 0.70, reason: 'Often bought with Eggs' },
      { name: 'Salt', frequency: 0.55, reason: 'Often bought with Eggs' },
      { name: 'Oil', frequency: 0.50, reason: 'Often bought with Eggs' },
    ],
  },
  {
    trigger: 'Coffee',
    companions: [
      { name: 'Sugar', frequency: 0.82, reason: 'Often bought with Coffee' },
      { name: 'Milk', frequency: 0.78, reason: 'Often bought with Coffee' },
      { name: 'Biscuits', frequency: 0.55, reason: 'Often bought with Coffee' },
    ],
  },
  {
    trigger: 'Dal',
    companions: [
      { name: 'Rice', frequency: 0.88, reason: 'Often bought with Dal' },
      { name: 'Oil', frequency: 0.70, reason: 'Often bought with Dal' },
      { name: 'Onions', frequency: 0.65, reason: 'Often bought with Dal' },
    ],
  },
  {
    trigger: 'Oil',
    companions: [
      { name: 'Onions', frequency: 0.72, reason: 'Often bought with Oil' },
      { name: 'Salt', frequency: 0.60, reason: 'Often bought with Oil' },
      { name: 'Rice', frequency: 0.55, reason: 'Often bought with Oil' },
    ],
  },
  {
    trigger: 'Sugar',
    companions: [
      { name: 'Tea', frequency: 0.85, reason: 'Often bought with Sugar' },
      { name: 'Milk', frequency: 0.70, reason: 'Often bought with Sugar' },
      { name: 'Flour', frequency: 0.50, reason: 'Often bought with Sugar' },
    ],
  },
  {
    trigger: 'Butter',
    companions: [
      { name: 'Bread', frequency: 0.82, reason: 'Often bought with Butter' },
      { name: 'Jam', frequency: 0.60, reason: 'Often bought with Butter' },
      { name: 'Eggs', frequency: 0.50, reason: 'Often bought with Butter' },
    ],
  },
  {
    trigger: 'Onions',
    companions: [
      { name: 'Tomatoes', frequency: 0.80, reason: 'Often bought with Onions' },
      { name: 'Oil', frequency: 0.65, reason: 'Often bought with Onions' },
      { name: 'Garlic', frequency: 0.60, reason: 'Often bought with Onions' },
    ],
  },
  {
    trigger: 'Tomatoes',
    companions: [
      { name: 'Onions', frequency: 0.78, reason: 'Often bought with Tomatoes' },
      { name: 'Garlic', frequency: 0.62, reason: 'Often bought with Tomatoes' },
      { name: 'Salt', frequency: 0.50, reason: 'Often bought with Tomatoes' },
    ],
  },
  {
    trigger: 'Flour',
    companions: [
      { name: 'Sugar', frequency: 0.72, reason: 'Often bought with Flour' },
      { name: 'Oil', frequency: 0.65, reason: 'Often bought with Flour' },
      { name: 'Butter', frequency: 0.55, reason: 'Often bought with Flour' },
    ],
  },
  {
    trigger: 'Potatoes',
    companions: [
      { name: 'Onions', frequency: 0.75, reason: 'Often bought with Potatoes' },
      { name: 'Oil', frequency: 0.60, reason: 'Often bought with Potatoes' },
      { name: 'Salt', frequency: 0.50, reason: 'Often bought with Potatoes' },
    ],
  },
  {
    trigger: 'Yogurt',
    companions: [
      { name: 'Rice', frequency: 0.65, reason: 'Often bought with Yogurt' },
      { name: 'Sugar', frequency: 0.55, reason: 'Often bought with Yogurt' },
      { name: 'Fruit', frequency: 0.50, reason: 'Often bought with Yogurt' },
    ],
  },
  {
    trigger: 'Pasta',
    companions: [
      { name: 'Pasta Sauce', frequency: 0.88, reason: 'Often bought with Pasta' },
      { name: 'Cheese', frequency: 0.70, reason: 'Often bought with Pasta' },
      { name: 'Oil', frequency: 0.50, reason: 'Often bought with Pasta' },
    ],
  },
  {
    trigger: 'Cheese',
    companions: [
      { name: 'Bread', frequency: 0.72, reason: 'Often bought with Cheese' },
      { name: 'Butter', frequency: 0.55, reason: 'Often bought with Cheese' },
      { name: 'Pasta', frequency: 0.50, reason: 'Often bought with Cheese' },
    ],
  },
  {
    trigger: 'Noodles',
    companions: [
      { name: 'Vegetables', frequency: 0.70, reason: 'Often bought with Noodles' },
      { name: 'Oil', frequency: 0.60, reason: 'Often bought with Noodles' },
      { name: 'Eggs', frequency: 0.50, reason: 'Often bought with Noodles' },
    ],
  },
  {
    trigger: 'Chips',
    companions: [
      { name: 'Soft Drinks', frequency: 0.75, reason: 'Often bought with Chips' },
      { name: 'Dip', frequency: 0.60, reason: 'Often bought with Chips' },
      { name: 'Biscuits', frequency: 0.45, reason: 'Often bought with Chips' },
    ],
  },
  {
    trigger: 'Soap',
    companions: [
      { name: 'Shampoo', frequency: 0.72, reason: 'Often bought with Soap' },
      { name: 'Toothpaste', frequency: 0.55, reason: 'Often bought with Soap' },
      { name: 'Towel', frequency: 0.40, reason: 'Often bought with Soap' },
    ],
  },
];

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of basket completion suggestions per session */
export const MAX_SUGGESTIONS_PER_SESSION = 2;

// ─── Result Interface ────────────────────────────────────────────────────────

export interface BasketCompletionResult {
  suggestions: ProductSuggestion[];
}

// ─── Main Engine Function ────────────────────────────────────────────────────

/**
 * Identifies complementary products for the current cart using co-occurrence rules.
 *
 * Rules:
 * - Maximum 2 suggestions per session (tracked via sessionContext.suggestionsGiven.basketCompletion)
 * - Does not suggest items already in the cart
 * - Prioritizes items with higher co-occurrence frequency
 * - Includes a reason for each suggestion
 *
 * @param cart - Current cart items
 * @param sessionContext - Session context for tracking suggestion limits
 * @param catalog - Available product catalog to match suggestions against
 * @returns BasketCompletionResult with up to 2 suggestions
 */
export function getBasketCompletions(
  cart: CartItem[],
  sessionContext: SessionContext,
  catalog: Product[]
): BasketCompletionResult {
  const alreadySuggested = sessionContext.suggestionsGiven.basketCompletion;
  const remainingSlots = MAX_SUGGESTIONS_PER_SESSION - alreadySuggested;

  // No more suggestions allowed this session
  if (remainingSlots <= 0) {
    return { suggestions: [] };
  }

  // Empty cart — nothing to base suggestions on
  if (cart.length === 0) {
    return { suggestions: [] };
  }

  // Build a set of product names already in the cart (case-insensitive)
  const cartProductNames = new Set(
    cart.map((item) => item.name.toLowerCase())
  );

  // Collect all candidate companions from matching rules
  const candidates: {
    name: string;
    frequency: number;
    reason: string;
  }[] = [];

  for (const item of cart) {
    const rule = CO_OCCURRENCE_RULES.find(
      (r) => r.trigger.toLowerCase() === item.name.toLowerCase()
    );
    if (!rule) continue;

    for (const companion of rule.companions) {
      // Skip if already in cart
      if (cartProductNames.has(companion.name.toLowerCase())) continue;
      candidates.push(companion);
    }
  }

  // Deduplicate by name, keeping the highest frequency entry
  const deduped = new Map<string, { name: string; frequency: number; reason: string }>();
  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || candidate.frequency > existing.frequency) {
      deduped.set(key, candidate);
    }
  }

  // Sort by frequency descending
  const sorted = [...deduped.values()].sort(
    (a, b) => b.frequency - a.frequency
  );

  // Match against the catalog and build suggestions
  const suggestions: ProductSuggestion[] = [];

  for (const candidate of sorted) {
    if (suggestions.length >= remainingSlots) break;

    const product = catalog.find(
      (p) => p.name.toLowerCase() === candidate.name.toLowerCase()
    );
    if (!product) continue;

    suggestions.push({
      product,
      reason: candidate.reason,
      confidence: candidate.frequency,
    });
  }

  return { suggestions };
}
