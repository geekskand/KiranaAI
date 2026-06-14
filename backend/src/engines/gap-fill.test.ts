/**
 * Unit tests for the Gap-Fill Engine.
 * Requirements: 7.1, 7.2, 7.3
 */

import { describe, it, expect } from 'vitest';
import {
  getGapFillSuggestion,
  calculateCartTotal,
  DEFAULT_FREE_DELIVERY_THRESHOLD,
} from './gap-fill.js';
import type { CartItem, Product, SessionContext } from '../models/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCart(items: Array<{ id: string; price: number; qty?: number }>): CartItem[] {
  return items.map((i) => ({
    productId: i.id,
    name: `Product ${i.id}`,
    price: i.price,
    quantity: i.qty ?? 1,
  }));
}

function makeCatalog(products: Array<{ id: string; price: number }>): Product[] {
  return products.map((p) => ({
    productId: p.id,
    name: `Product ${p.id}`,
    price: p.price,
    category: 'grocery',
    brand: 'TestBrand',
    labels: [],
  }));
}

function makeSessionContext(gapFillCount = 0): SessionContext {
  return {
    sessionId: 'test-session',
    userId: 'test-user',
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

// ─── calculateCartTotal ──────────────────────────────────────────────────────

describe('calculateCartTotal', () => {
  it('returns 0 for an empty cart', () => {
    expect(calculateCartTotal([])).toBe(0);
  });

  it('sums prices multiplied by quantities', () => {
    const cart = makeCart([
      { id: '1', price: 100, qty: 2 },
      { id: '2', price: 50, qty: 1 },
    ]);
    expect(calculateCartTotal(cart)).toBe(250);
  });

  it('handles single item', () => {
    const cart = makeCart([{ id: '1', price: 399 }]);
    expect(calculateCartTotal(cart)).toBe(399);
  });
});

// ─── getGapFillSuggestion ────────────────────────────────────────────────────

describe('getGapFillSuggestion', () => {
  describe('no suggestion needed', () => {
    it('returns null suggestion when cart is at threshold', () => {
      const cart = makeCart([{ id: '1', price: 499 }]);
      const catalog = makeCatalog([{ id: '2', price: 50 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).toBeNull();
      expect(result.cartTotal).toBe(499);
      expect(result.gap).toBe(0);
    });

    it('returns null suggestion when cart is above threshold', () => {
      const cart = makeCart([{ id: '1', price: 600 }]);
      const catalog = makeCatalog([{ id: '2', price: 50 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).toBeNull();
      expect(result.cartTotal).toBe(600);
      expect(result.gap).toBe(0);
    });
  });

  describe('session limit enforcement (max 1 per session)', () => {
    it('returns null suggestion when gap-fill already given in session', () => {
      const cart = makeCart([{ id: '1', price: 200 }]);
      const catalog = makeCatalog([{ id: '2', price: 300 }]);
      const session = makeSessionContext(1); // already given 1

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).toBeNull();
      expect(result.gap).toBe(299);
    });
  });

  describe('product selection logic', () => {
    it('selects product that fills the gap with minimal overshoot', () => {
      const cart = makeCart([{ id: '1', price: 350 }]);
      // Gap is 149. Products: 100 (doesn't fill), 150 (fills, +1 over), 200 (fills, +51 over)
      const catalog = makeCatalog([
        { id: 'a', price: 100 },
        { id: 'b', price: 150 },
        { id: 'c', price: 200 },
      ]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.productId).toBe('b');
      expect(result.suggestion!.product.price).toBe(150);
      expect(result.gap).toBe(149);
    });

    it('selects the cheapest product when multiple fill the gap equally', () => {
      const cart = makeCart([{ id: '1', price: 400 }]);
      // Gap is 99. Products: 99, 100, 150 — all fill the gap
      const catalog = makeCatalog([
        { id: 'a', price: 150 },
        { id: 'b', price: 99 },
        { id: 'c', price: 100 },
      ]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.productId).toBe('b');
      expect(result.suggestion!.product.price).toBe(99);
    });

    it('selects most expensive product when none fills the gap', () => {
      const cart = makeCart([{ id: '1', price: 100 }]);
      // Gap is 399. No product is >= 399
      const catalog = makeCatalog([
        { id: 'a', price: 50 },
        { id: 'b', price: 200 },
        { id: 'c', price: 150 },
      ]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.productId).toBe('b');
      expect(result.suggestion!.product.price).toBe(200);
    });

    it('does not suggest products already in cart', () => {
      const cart = makeCart([{ id: 'a', price: 350 }]);
      // Gap is 149. Product 'a' (price 200) fills it but is in cart.
      // Product 'b' (price 149) fills it exactly.
      const catalog = makeCatalog([
        { id: 'a', price: 200 },
        { id: 'b', price: 149 },
      ]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.productId).toBe('b');
    });

    it('returns null when all catalog products are already in cart', () => {
      const cart = makeCart([
        { id: 'a', price: 200 },
        { id: 'b', price: 100 },
      ]);
      const catalog = makeCatalog([
        { id: 'a', price: 200 },
        { id: 'b', price: 100 },
      ]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).toBeNull();
    });
  });

  describe('custom threshold support', () => {
    it('uses custom threshold when provided', () => {
      const cart = makeCart([{ id: '1', price: 200 }]);
      const catalog = makeCatalog([{ id: '2', price: 100 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog, 250);

      expect(result.threshold).toBe(250);
      expect(result.gap).toBe(50);
      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.price).toBe(100);
    });

    it('defaults to 499 when no threshold provided', () => {
      const cart = makeCart([{ id: '1', price: 400 }]);
      const catalog = makeCatalog([{ id: '2', price: 100 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.threshold).toBe(DEFAULT_FREE_DELIVERY_THRESHOLD);
      expect(result.gap).toBe(99);
    });
  });

  describe('suggestion reason', () => {
    it('includes reason about free delivery when product fills gap', () => {
      const cart = makeCart([{ id: '1', price: 400 }]);
      const catalog = makeCatalog([{ id: '2', price: 100 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.reason).toContain('free delivery');
      expect(result.suggestion!.reason).toContain('99');
    });

    it('includes reason about getting closer when product does not fully fill gap', () => {
      const cart = makeCart([{ id: '1', price: 100 }]);
      // Gap is 399, no product reaches it
      const catalog = makeCatalog([{ id: '2', price: 50 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.reason).toContain('closer to free delivery');
    });
  });

  describe('result metadata', () => {
    it('returns correct cartTotal, threshold, and gap', () => {
      const cart = makeCart([
        { id: '1', price: 100, qty: 2 },
        { id: '2', price: 50 },
      ]);
      const catalog = makeCatalog([{ id: '3', price: 300 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.cartTotal).toBe(250);
      expect(result.threshold).toBe(499);
      expect(result.gap).toBe(249);
    });
  });

  describe('edge cases', () => {
    it('handles empty cart', () => {
      const catalog = makeCatalog([{ id: '1', price: 500 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion([], session, catalog);

      expect(result.cartTotal).toBe(0);
      expect(result.gap).toBe(499);
      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.price).toBe(500);
    });

    it('handles empty catalog', () => {
      const cart = makeCart([{ id: '1', price: 200 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, []);

      expect(result.suggestion).toBeNull();
    });

    it('handles product priced exactly at the gap', () => {
      const cart = makeCart([{ id: '1', price: 400 }]);
      // Gap is exactly 99
      const catalog = makeCatalog([{ id: '2', price: 99 }]);
      const session = makeSessionContext();

      const result = getGapFillSuggestion(cart, session, catalog);

      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.product.price).toBe(99);
      // cart total + product price should equal threshold
      expect(result.cartTotal + result.suggestion!.product.price).toBe(499);
    });
  });
});
