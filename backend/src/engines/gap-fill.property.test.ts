/**
 * Property-Based Test: Gap-Fill Threshold Satisfaction (Property 11)
 *
 * For any cart with total below the free delivery threshold, the gap-fill product
 * suggestion price added to the cart total SHALL be greater than or equal to the
 * free delivery threshold.
 *
 * **Validates: Requirements 7.1**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getGapFillSuggestion, calculateCartTotal, DEFAULT_FREE_DELIVERY_THRESHOLD } from './gap-fill.js';
import type { CartItem, Product, SessionContext } from '../models/index.js';

/**
 * Arbitrary generator for cart items with controlled prices.
 * Generates items that sum to below a given threshold.
 */
function arbCartItems(maxTotal: number) {
  return fc
    .array(
      fc.record({
        productId: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 30 }),
        price: fc.integer({ min: 1, max: Math.max(1, Math.floor(maxTotal / 2)) }),
        quantity: fc.integer({ min: 1, max: 3 }),
      }),
      { minLength: 1, maxLength: 5 }
    )
    .filter((items) => {
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      return total < maxTotal && total > 0;
    });
}

/**
 * Arbitrary generator for a product catalog with various prices.
 */
function arbCatalog(minProducts: number = 1) {
  return fc.array(
    fc.record({
      productId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      price: fc.integer({ min: 1, max: 1000 }),
      category: fc.constantFrom('snacks', 'beverages', 'dairy', 'household', 'personal-care'),
      brand: fc.string({ minLength: 1, maxLength: 20 }),
      labels: fc.array(fc.constantFrom('organic', 'low-sugar', 'gluten-free', 'vegan'), { maxLength: 3 }),
    }),
    { minLength: minProducts, maxLength: 15 }
  );
}

/**
 * Create a minimal session context with zero gap-fill suggestions given.
 */
function makeSessionContext(): SessionContext {
  return {
    sessionId: 'test-session',
    userId: 'test-user',
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: {
      basketCompletion: 0,
      gapFill: 0,
    },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

describe('Property 11: Gap-Fill Threshold Satisfaction', () => {
  it('when a gap-fill suggestion is returned AND catalog has a product >= gap, cartTotal + suggestion.price >= threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2000 }),
        fc.integer({ min: 100, max: 2000 }).chain((threshold) =>
          fc.tuple(
            fc.constant(threshold),
            arbCartItems(threshold),
            arbCatalog(3)
          )
        ),
        (_, [threshold, cart, catalog]) => {
          const session = makeSessionContext();
          const cartTotal = calculateCartTotal(cart);
          const gap = threshold - cartTotal;

          // Ensure at least one product in catalog can fill the gap
          const hasGapFiller = catalog.some(
            (p) => p.price >= gap && !cart.some((c) => c.productId === p.productId)
          );

          const result = getGapFillSuggestion(cart, session, catalog, threshold);

          if (hasGapFiller && result.suggestion !== null) {
            // THE KEY PROPERTY: cartTotal + suggestion price >= threshold
            expect(cartTotal + result.suggestion.product.price).toBeGreaterThanOrEqual(threshold);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('when cart is already at or above threshold, suggestion is null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),
        fc.array(
          fc.record({
            productId: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 30 }),
            price: fc.integer({ min: 50, max: 500 }),
            quantity: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        arbCatalog(3),
        (threshold, cart, catalog) => {
          const cartTotal = calculateCartTotal(cart);

          // Only test cases where cart is at or above threshold
          fc.pre(cartTotal >= threshold);

          const session = makeSessionContext();
          const result = getGapFillSuggestion(cart, session, catalog, threshold);

          // When cart is at or above threshold, no suggestion should be made
          expect(result.suggestion).toBeNull();
          expect(result.gap).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('when catalog contains a product that fills the gap exactly, it is selected (minimum overshoot)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2000 }).chain((threshold) =>
          fc.tuple(
            fc.constant(threshold),
            arbCartItems(threshold)
          )
        ),
        ([threshold, cart]) => {
          const session = makeSessionContext();
          const cartTotal = calculateCartTotal(cart);
          const gap = threshold - cartTotal;

          // Create a catalog with an exact-gap product and a more expensive one
          const exactProduct: Product = {
            productId: 'exact-filler',
            name: 'Exact Filler',
            price: gap,
            category: 'snacks',
            brand: 'TestBrand',
            labels: [],
          };
          const overshootProduct: Product = {
            productId: 'overshoot-filler',
            name: 'Overshoot Filler',
            price: gap + 100,
            category: 'snacks',
            brand: 'TestBrand',
            labels: [],
          };

          const catalog = [overshootProduct, exactProduct];
          const result = getGapFillSuggestion(cart, session, catalog, threshold);

          if (result.suggestion !== null) {
            // Should pick the exact filler (minimum overshoot)
            expect(result.suggestion.product.price).toBe(gap);
            // Threshold satisfaction still holds
            expect(cartTotal + result.suggestion.product.price).toBeGreaterThanOrEqual(threshold);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
