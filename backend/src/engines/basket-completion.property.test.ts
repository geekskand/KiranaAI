/**
 * Property-Based Test: Basket Completion Limit (Property 10)
 *
 * For any session and cart contents, the Basket Completion Engine SHALL produce
 * at most 2 complementary product suggestions regardless of cart contents or user history.
 *
 * **Validates: Requirements 6.2**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getBasketCompletions,
  CO_OCCURRENCE_RULES,
  MAX_SUGGESTIONS_PER_SESSION,
} from './basket-completion.js';
import type { CartItem, Product, SessionContext } from '../models/index.js';

// ─── Realistic Catalog (includes products matching co-occurrence companions) ─

const CATALOG: Product[] = [
  { productId: 'p1', name: 'Milk', price: 60, category: 'dairy', brand: 'Amul', labels: ['vegetarian'] },
  { productId: 'p2', name: 'Bread', price: 45, category: 'bakery', brand: 'Harvest', labels: [] },
  { productId: 'p3', name: 'Butter', price: 55, category: 'dairy', brand: 'Amul', labels: ['vegetarian'] },
  { productId: 'p4', name: 'Sugar', price: 40, category: 'staples', brand: 'India Gate', labels: [] },
  { productId: 'p5', name: 'Jam', price: 120, category: 'spreads', brand: 'Kissan', labels: ['vegetarian'] },
  { productId: 'p6', name: 'Eggs', price: 70, category: 'dairy', brand: 'Farm Fresh', labels: [] },
  { productId: 'p7', name: 'Rice', price: 150, category: 'staples', brand: 'India Gate', labels: ['gluten-free'] },
  { productId: 'p8', name: 'Dal', price: 90, category: 'staples', brand: 'Tata', labels: ['vegetarian'] },
  { productId: 'p9', name: 'Oil', price: 180, category: 'staples', brand: 'Fortune', labels: ['vegetarian'] },
  { productId: 'p10', name: 'Salt', price: 20, category: 'staples', brand: 'Tata', labels: [] },
  { productId: 'p11', name: 'Tea', price: 200, category: 'beverages', brand: 'Tata', labels: ['vegetarian'] },
  { productId: 'p12', name: 'Coffee', price: 250, category: 'beverages', brand: 'Nescafe', labels: [] },
  { productId: 'p13', name: 'Biscuits', price: 30, category: 'snacks', brand: 'Britannia', labels: ['vegetarian'] },
  { productId: 'p14', name: 'Onions', price: 35, category: 'vegetables', brand: 'Local', labels: ['organic'] },
  { productId: 'p15', name: 'Tomatoes', price: 40, category: 'vegetables', brand: 'Local', labels: ['organic'] },
  { productId: 'p16', name: 'Garlic', price: 25, category: 'vegetables', brand: 'Local', labels: [] },
  { productId: 'p17', name: 'Flour', price: 60, category: 'staples', brand: 'Aashirvaad', labels: ['vegetarian'] },
  { productId: 'p18', name: 'Potatoes', price: 30, category: 'vegetables', brand: 'Local', labels: [] },
  { productId: 'p19', name: 'Yogurt', price: 45, category: 'dairy', brand: 'Amul', labels: ['vegetarian'] },
  { productId: 'p20', name: 'Pasta', price: 80, category: 'staples', brand: 'Barilla', labels: ['vegetarian'] },
  { productId: 'p21', name: 'Pasta Sauce', price: 110, category: 'sauces', brand: 'Barilla', labels: ['vegetarian'] },
  { productId: 'p22', name: 'Cheese', price: 130, category: 'dairy', brand: 'Amul', labels: ['vegetarian'] },
  { productId: 'p23', name: 'Noodles', price: 25, category: 'staples', brand: 'Maggi', labels: ['vegetarian'] },
  { productId: 'p24', name: 'Vegetables', price: 50, category: 'vegetables', brand: 'Local', labels: ['organic'] },
  { productId: 'p25', name: 'Chips', price: 30, category: 'snacks', brand: 'Lays', labels: [] },
  { productId: 'p26', name: 'Soft Drinks', price: 40, category: 'beverages', brand: 'Coca-Cola', labels: [] },
  { productId: 'p27', name: 'Dip', price: 60, category: 'spreads', brand: 'Local', labels: ['vegetarian'] },
  { productId: 'p28', name: 'Soap', price: 35, category: 'personal-care', brand: 'Dove', labels: [] },
  { productId: 'p29', name: 'Shampoo', price: 150, category: 'personal-care', brand: 'Dove', labels: [] },
  { productId: 'p30', name: 'Toothpaste', price: 70, category: 'personal-care', brand: 'Colgate', labels: [] },
  { productId: 'p31', name: 'Fruit', price: 80, category: 'fruits', brand: 'Local', labels: ['organic'] },
  { productId: 'p32', name: 'Towel', price: 200, category: 'household', brand: 'Local', labels: [] },
];

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generator for trigger product names from co-occurrence rules */
const triggerNameArb = fc.constantFrom(
  ...CO_OCCURRENCE_RULES.map((r) => r.trigger)
);

/** Generator for cart items using real trigger names */
const cartItemArb = (name: string): fc.Arbitrary<CartItem> =>
  fc.record({
    productId: fc.constant(`p-${name.toLowerCase()}`),
    name: fc.constant(name),
    price: fc.integer({ min: 10, max: 500 }),
    quantity: fc.integer({ min: 1, max: 10 }),
  });

/** Generator for a non-empty cart with products matching co-occurrence triggers */
const cartArb: fc.Arbitrary<CartItem[]> = fc
  .uniqueArray(triggerNameArb, { minLength: 1, maxLength: 10 })
  .chain((names) => fc.tuple(...names.map((n) => cartItemArb(n))))
  .map((items) => items as CartItem[]);

/** Generator for basketCompletion count (including values beyond the limit) */
const basketCompletionCountArb = fc.integer({ min: 0, max: 5 });

/** Generator for a session context with variable basketCompletion count */
const sessionContextArb = (
  basketCompletionCount: number
): fc.Arbitrary<SessionContext> =>
  fc.constant<SessionContext>({
    sessionId: 'test-session',
    userId: 'test-user',
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: {
      basketCompletion: basketCompletionCount,
      gapFill: 0,
    },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 10: Basket Completion Limit', () => {
  it('for any cart and session, engine produces at most 2 suggestions', () => {
    fc.assert(
      fc.property(
        cartArb,
        basketCompletionCountArb,
        (cart, basketCompletionCount) => {
          const session: SessionContext = {
            sessionId: 'test-session',
            userId: 'test-user',
            conversationHistory: [],
            cartState: cart,
            agentReasoningHistory: [],
            suggestionsGiven: {
              basketCompletion: basketCompletionCount,
              gapFill: 0,
            },
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          };

          const result = getBasketCompletions(cart, session, CATALOG);

          // Core property: at most MAX_SUGGESTIONS_PER_SESSION (2) suggestions
          expect(result.suggestions.length).toBeLessThanOrEqual(
            MAX_SUGGESTIONS_PER_SESSION
          );
        }
      ),
      { numRuns: 200 }
    );
  });

  it('when suggestionsGiven.basketCompletion >= 2, returns zero suggestions', () => {
    fc.assert(
      fc.property(
        cartArb,
        fc.integer({ min: 2, max: 10 }),
        (cart, basketCompletionCount) => {
          const session: SessionContext = {
            sessionId: 'test-session',
            userId: 'test-user',
            conversationHistory: [],
            cartState: cart,
            agentReasoningHistory: [],
            suggestionsGiven: {
              basketCompletion: basketCompletionCount,
              gapFill: 0,
            },
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          };

          const result = getBasketCompletions(cart, session, CATALOG);

          // When limit already reached, no more suggestions are produced
          expect(result.suggestions).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('remaining suggestions = max(0, 2 - alreadySuggested) is respected', () => {
    fc.assert(
      fc.property(
        cartArb,
        basketCompletionCountArb,
        (cart, basketCompletionCount) => {
          const session: SessionContext = {
            sessionId: 'test-session',
            userId: 'test-user',
            conversationHistory: [],
            cartState: cart,
            agentReasoningHistory: [],
            suggestionsGiven: {
              basketCompletion: basketCompletionCount,
              gapFill: 0,
            },
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
          };

          const result = getBasketCompletions(cart, session, CATALOG);
          const remainingSlots = Math.max(
            0,
            MAX_SUGGESTIONS_PER_SESSION - basketCompletionCount
          );

          // Suggestions never exceed the remaining slots
          expect(result.suggestions.length).toBeLessThanOrEqual(remainingSlots);
        }
      ),
      { numRuns: 200 }
    );
  });
});
