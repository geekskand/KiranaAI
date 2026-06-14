/**
 * Property-Based Test: Gap-Fill Suggestion Limit (Property 12)
 *
 * For any session, the Gap-Fill Engine SHALL produce at most 1 gap-fill suggestion.
 * When suggestionsGiven.gapFill >= 1, the result always has suggestion === null.
 *
 * **Validates: Requirements 7.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getGapFillSuggestion, DEFAULT_FREE_DELIVERY_THRESHOLD } from './gap-fill.js';
import type { CartItem, Product, SessionContext } from '../models/index.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const productIdArb = fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/);

const cartItemArb: fc.Arbitrary<CartItem> = fc.record({
  productId: productIdArb,
  name: fc.string({ minLength: 1, maxLength: 20 }),
  price: fc.integer({ min: 1, max: 400 }), // below threshold to create a gap
  quantity: fc.integer({ min: 1, max: 5 }),
});

const cartArb: fc.Arbitrary<CartItem[]> = fc.array(cartItemArb, {
  minLength: 1,
  maxLength: 5,
});

const catalogProductArb: fc.Arbitrary<Product> = fc.record({
  productId: productIdArb,
  name: fc.string({ minLength: 1, maxLength: 20 }),
  price: fc.integer({ min: 1, max: 1000 }),
  category: fc.constantFrom('grocery', 'snacks', 'beverages', 'dairy', 'household'),
  brand: fc.string({ minLength: 1, maxLength: 15 }),
  labels: fc.array(fc.constantFrom('organic', 'low-sugar', 'vegan', 'gluten-free'), {
    minLength: 0,
    maxLength: 3,
  }),
});

const catalogArb: fc.Arbitrary<Product[]> = fc.array(catalogProductArb, {
  minLength: 1,
  maxLength: 10,
});

const gapFillCountArb = fc.integer({ min: 0, max: 10 });

function makeSessionContext(gapFillCount: number): SessionContext {
  return {
    sessionId: 'pbt-session',
    userId: 'pbt-user',
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: {
      basketCompletion: 0,
      gapFill: gapFillCount,
    },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 12: Gap-Fill Suggestion Limit', () => {
  it('when suggestionsGiven.gapFill >= 1, the result always has suggestion === null', () => {
    fc.assert(
      fc.property(
        cartArb,
        catalogArb,
        fc.integer({ min: 1, max: 100 }), // gapFill count already >= 1
        (cart, catalog, gapFillCount) => {
          const session = makeSessionContext(gapFillCount);
          const result = getGapFillSuggestion(cart, session, catalog);

          // Once the limit is reached, no further suggestions should be given
          expect(result.suggestion).toBeNull();
        }
      ),
      { numRuns: 200 }
    );
  });

  it('the function never returns more than 1 suggestion (returns either a single ProductSuggestion or null)', () => {
    fc.assert(
      fc.property(
        cartArb,
        catalogArb,
        gapFillCountArb,
        (cart, catalog, gapFillCount) => {
          const session = makeSessionContext(gapFillCount);
          const result = getGapFillSuggestion(cart, session, catalog);

          // The result is always either null or a single ProductSuggestion — never an array or multiple
          if (result.suggestion !== null) {
            // Verify it's a valid single ProductSuggestion shape
            expect(result.suggestion.product).toBeDefined();
            expect(result.suggestion.product.productId).toBeDefined();
            expect(result.suggestion.reason).toBeDefined();
            expect(typeof result.suggestion.confidence).toBe('number');

            // This can only happen when gapFill was 0 (limit not yet reached)
            expect(gapFillCount).toBe(0);
          }

          // The result type is ProductSuggestion | null — never an array
          // This confirms at most 1 suggestion is ever produced per call
          expect(
            result.suggestion === null || typeof result.suggestion === 'object'
          ).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
