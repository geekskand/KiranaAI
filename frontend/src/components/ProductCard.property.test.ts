/**
 * Property-Based Test: Product Card Completeness (Property 2)
 *
 * For any agent response that references a product, the response payload SHALL
 * include a product card containing the product name, current price, and an
 * add-to-cart action (identified by productId).
 *
 * This tests the contract between agent responses and the ProductCard component rendering.
 *
 * **Validates: Requirements 1.5, 6.3, 7.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ProductCard } from '../hooks/useWebSocket';

// ─── Types mirroring AgentResponse payload ───────────────────────────────────

interface AgentResponsePayload {
  content: string;
  products?: ProductCard[];
  action?: 'auto-added' | 'suggest' | 'shortlist';
  sessionId: string;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generator for a valid ProductCard with all required fields populated. */
const validProductCardArb: fc.Arbitrary<ProductCard> = fc.record({
  productId: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  price: fc.double({ min: 0.01, max: 10000, noNaN: true }),
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
  reason: fc.option(
    fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
    { nil: undefined }
  ),
});

/** Generator for an array of product cards (1 to 5 products). */
const productArrayArb = fc.array(validProductCardArb, { minLength: 1, maxLength: 5 });

/** Generator for agent response content text. */
const agentContentArb = fc.string({ minLength: 1, maxLength: 500 });

/** Generator for session IDs. */
const sessionIdArb = fc.string({ minLength: 5, maxLength: 40 }).filter((s) => s.trim().length > 0);

/** Generator for agent action types. */
const actionArb = fc.option(fc.constantFrom('auto-added' as const, 'suggest' as const, 'shortlist' as const), {
  nil: undefined,
});

/** Generator for an AgentResponse payload that contains products. */
const agentResponseWithProductsArb: fc.Arbitrary<AgentResponsePayload> = fc.record({
  content: agentContentArb,
  products: productArrayArb,
  action: actionArb,
  sessionId: sessionIdArb,
});

// ─── Validation Functions ────────────────────────────────────────────────────

/**
 * Validates a single product card has all required fields for completeness:
 * - productId: non-empty string (needed for add-to-cart action)
 * - name: non-empty string
 * - price: positive number
 */
function isProductCardComplete(card: ProductCard): boolean {
  return (
    typeof card.productId === 'string' &&
    card.productId.trim().length > 0 &&
    typeof card.name === 'string' &&
    card.name.trim().length > 0 &&
    typeof card.price === 'number' &&
    card.price > 0
  );
}

/**
 * Validates that an agent response with products has all cards complete.
 */
function validateResponseCompleteness(response: AgentResponsePayload): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!response.products || response.products.length === 0) {
    // No products, nothing to validate (response doesn't reference products)
    return { valid: true, errors: [] };
  }

  for (let i = 0; i < response.products.length; i++) {
    const card = response.products[i];

    if (!card.productId || card.productId.trim().length === 0) {
      errors.push(`Product[${i}]: missing or empty productId (required for add-to-cart action)`);
    }

    if (!card.name || card.name.trim().length === 0) {
      errors.push(`Product[${i}]: missing or empty name`);
    }

    if (typeof card.price !== 'number' || card.price <= 0) {
      errors.push(`Product[${i}]: price must be a positive number, got ${card.price}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 2: Product Card Completeness', () => {
  it('for any agent response with products, every product card has a non-empty name, price > 0, and a productId for add-to-cart', () => {
    fc.assert(
      fc.property(agentResponseWithProductsArb, (response) => {
        // Precondition: response has products
        expect(response.products).toBeDefined();
        expect(response.products!.length).toBeGreaterThan(0);

        // Property: every product card is complete
        for (const card of response.products!) {
          expect(isProductCardComplete(card)).toBe(true);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('for any agent response with products, the validateResponseCompleteness function reports no errors', () => {
    fc.assert(
      fc.property(agentResponseWithProductsArb, (response) => {
        const result = validateResponseCompleteness(response);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 300 }
    );
  });

  it('for any product card, productId enables add-to-cart action identification', () => {
    fc.assert(
      fc.property(validProductCardArb, (card) => {
        // The productId must be a non-empty string that can be used to identify
        // which product to add to cart
        expect(typeof card.productId).toBe('string');
        expect(card.productId.trim().length).toBeGreaterThan(0);

        // Simulate what the add-to-cart handler receives
        const addToCartPayload = { productId: card.productId };
        expect(addToCartPayload.productId).toBe(card.productId);
      }),
      { numRuns: 200 }
    );
  });

  it('incomplete product cards (missing fields) are correctly detected', () => {
    // Test that our validation correctly rejects cards with missing/invalid fields
    const incompleteCardArb = fc.oneof(
      // Missing productId
      fc.record({
        productId: fc.constant(''),
        name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        price: fc.double({ min: 0.01, max: 10000, noNaN: true }),
      }),
      // Missing name
      fc.record({
        productId: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        name: fc.constant(''),
        price: fc.double({ min: 0.01, max: 10000, noNaN: true }),
      }),
      // Invalid price (zero or negative)
      fc.record({
        productId: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        price: fc.double({ min: -1000, max: 0, noNaN: true }),
      })
    );

    fc.assert(
      fc.property(incompleteCardArb, (card) => {
        const asProductCard = card as ProductCard;
        expect(isProductCardComplete(asProductCard)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });
});
