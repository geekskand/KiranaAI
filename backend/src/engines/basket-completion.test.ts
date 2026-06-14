/**
 * Unit tests for Basket Completion Engine.
 *
 * Validates co-occurrence rule matching, suggestion limits,
 * cart exclusion, frequency prioritization, and session tracking.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import { describe, it, expect } from 'vitest';
import {
  getBasketCompletions,
  CO_OCCURRENCE_RULES,
  MAX_SUGGESTIONS_PER_SESSION,
} from './basket-completion.js';
import type { CartItem, Product, SessionContext } from '../models/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    productId: 'prod-1',
    name: 'Milk',
    price: 60,
    category: 'dairy',
    brand: 'Amul',
    labels: [],
    ...overrides,
  };
}

function createCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'prod-1',
    name: 'Milk',
    price: 60,
    quantity: 1,
    ...overrides,
  };
}

function createSessionContext(
  basketCompletionCount = 0
): SessionContext {
  return {
    sessionId: 'session-1',
    userId: 'user-1',
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: {
      basketCompletion: basketCompletionCount,
      gapFill: 0,
    },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

/** A minimal catalog containing products needed for testing */
const testCatalog: Product[] = [
  createProduct({ productId: 'p-milk', name: 'Milk', price: 60, category: 'dairy', brand: 'Amul' }),
  createProduct({ productId: 'p-bread', name: 'Bread', price: 40, category: 'bakery', brand: 'Britannia' }),
  createProduct({ productId: 'p-butter', name: 'Butter', price: 55, category: 'dairy', brand: 'Amul' }),
  createProduct({ productId: 'p-jam', name: 'Jam', price: 120, category: 'spreads', brand: 'Kissan' }),
  createProduct({ productId: 'p-eggs', name: 'Eggs', price: 80, category: 'protein', brand: 'Farm Fresh' }),
  createProduct({ productId: 'p-rice', name: 'Rice', price: 150, category: 'grains', brand: 'India Gate' }),
  createProduct({ productId: 'p-dal', name: 'Dal', price: 110, category: 'pulses', brand: 'Tata' }),
  createProduct({ productId: 'p-oil', name: 'Oil', price: 180, category: 'cooking', brand: 'Fortune' }),
  createProduct({ productId: 'p-sugar', name: 'Sugar', price: 45, category: 'essentials', brand: 'Dhampure' }),
  createProduct({ productId: 'p-tea', name: 'Tea', price: 200, category: 'beverages', brand: 'Tata' }),
  createProduct({ productId: 'p-salt', name: 'Salt', price: 20, category: 'essentials', brand: 'Tata' }),
  createProduct({ productId: 'p-biscuits', name: 'Biscuits', price: 30, category: 'snacks', brand: 'Parle' }),
  createProduct({ productId: 'p-onions', name: 'Onions', price: 35, category: 'vegetables', brand: 'Local' }),
  createProduct({ productId: 'p-tomatoes', name: 'Tomatoes', price: 40, category: 'vegetables', brand: 'Local' }),
  createProduct({ productId: 'p-flour', name: 'Flour', price: 55, category: 'grains', brand: 'Aashirvaad' }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BasketCompletionEngine', () => {
  describe('getBasketCompletions', () => {
    it('returns suggestions for items in the cart that have co-occurrence rules', () => {
      const cart = [createCartItem({ name: 'Milk' })];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS_PER_SESSION);
    });

    it('does not suggest items already in the cart', () => {
      const cart = [
        createCartItem({ name: 'Milk' }),
        createCartItem({ name: 'Bread', productId: 'p-bread', price: 40 }),
      ];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      const suggestedNames = result.suggestions.map((s) => s.product.name.toLowerCase());
      expect(suggestedNames).not.toContain('milk');
      expect(suggestedNames).not.toContain('bread');
    });

    it('returns at most 2 suggestions per session (MAX_SUGGESTIONS_PER_SESSION)', () => {
      // Cart with many items that trigger multiple rules
      const cart = [
        createCartItem({ name: 'Milk' }),
        createCartItem({ name: 'Rice', productId: 'p-rice', price: 150 }),
        createCartItem({ name: 'Tea', productId: 'p-tea', price: 200 }),
      ];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions.length).toBeLessThanOrEqual(2);
    });

    it('returns no suggestions when session limit has been reached', () => {
      const cart = [createCartItem({ name: 'Milk' })];
      const session = createSessionContext(2); // already given 2 suggestions

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions).toHaveLength(0);
    });

    it('returns only 1 suggestion when 1 has already been given this session', () => {
      const cart = [
        createCartItem({ name: 'Milk' }),
        createCartItem({ name: 'Rice', productId: 'p-rice', price: 150 }),
      ];
      const session = createSessionContext(1); // 1 already given

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions.length).toBeLessThanOrEqual(1);
    });

    it('returns no suggestions for an empty cart', () => {
      const cart: CartItem[] = [];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions).toHaveLength(0);
    });

    it('returns no suggestions for cart items with no matching rules', () => {
      const cart = [createCartItem({ name: 'Unknown Product XYZ' })];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions).toHaveLength(0);
    });

    it('prioritizes suggestions by co-occurrence frequency', () => {
      // Milk companions: Bread (0.85), Butter (0.72), Sugar (0.60)
      const cart = [createCartItem({ name: 'Milk' })];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions.length).toBe(2);
      // Bread has highest frequency (0.85), so it should come first
      expect(result.suggestions[0].product.name).toBe('Bread');
      expect(result.suggestions[0].confidence).toBe(0.85);
      // Butter has second-highest (0.72)
      expect(result.suggestions[1].product.name).toBe('Butter');
      expect(result.suggestions[1].confidence).toBe(0.72);
    });

    it('includes a reason for each suggestion', () => {
      const cart = [createCartItem({ name: 'Milk' })];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      for (const suggestion of result.suggestions) {
        expect(suggestion.reason).toBeDefined();
        expect(suggestion.reason.length).toBeGreaterThan(0);
        expect(suggestion.reason).toContain('Often bought with');
      }
    });

    it('only suggests products that exist in the catalog', () => {
      // Chips triggers Soft Drinks, Dip, Biscuits — but only Biscuits is in testCatalog
      const cart = [createCartItem({ name: 'Chips' })];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      // Only Biscuits should appear since others aren't in the catalog
      expect(result.suggestions.length).toBeLessThanOrEqual(1);
      if (result.suggestions.length > 0) {
        expect(result.suggestions[0].product.name).toBe('Biscuits');
      }
    });

    it('deduplicates suggestions when multiple cart items suggest the same companion', () => {
      // Rice suggests Oil (0.75), Eggs suggests Oil (0.50)
      // Only one Oil suggestion should appear, with the higher frequency
      const cart = [
        createCartItem({ name: 'Rice', productId: 'p-rice', price: 150 }),
        createCartItem({ name: 'Eggs', productId: 'p-eggs', price: 80 }),
      ];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      const oilSuggestions = result.suggestions.filter(
        (s) => s.product.name.toLowerCase() === 'oil'
      );
      // Should appear at most once
      expect(oilSuggestions.length).toBeLessThanOrEqual(1);

      // If Oil appears, it should have the higher frequency (0.75 from Rice)
      if (oilSuggestions.length === 1) {
        expect(oilSuggestions[0].confidence).toBe(0.75);
      }
    });

    it('handles case-insensitive matching for cart item names', () => {
      const cart = [createCartItem({ name: 'milk' })]; // lowercase
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('each suggestion contains a valid product with all fields', () => {
      const cart = [createCartItem({ name: 'Rice', productId: 'p-rice', price: 150 })];
      const session = createSessionContext(0);

      const result = getBasketCompletions(cart, session, testCatalog);

      for (const suggestion of result.suggestions) {
        expect(suggestion.product.productId).toBeDefined();
        expect(suggestion.product.name).toBeDefined();
        expect(suggestion.product.price).toBeGreaterThan(0);
        expect(suggestion.product.category).toBeDefined();
        expect(suggestion.product.brand).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThan(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('CO_OCCURRENCE_RULES', () => {
    it('contains at least 5 rules', () => {
      expect(CO_OCCURRENCE_RULES.length).toBeGreaterThanOrEqual(5);
    });

    it('each rule has a trigger and at least one companion', () => {
      for (const rule of CO_OCCURRENCE_RULES) {
        expect(rule.trigger).toBeDefined();
        expect(rule.trigger.length).toBeGreaterThan(0);
        expect(rule.companions.length).toBeGreaterThan(0);
      }
    });

    it('all companion frequencies are between 0 and 1', () => {
      for (const rule of CO_OCCURRENCE_RULES) {
        for (const companion of rule.companions) {
          expect(companion.frequency).toBeGreaterThan(0);
          expect(companion.frequency).toBeLessThanOrEqual(1);
        }
      }
    });

    it('all companions have a non-empty reason', () => {
      for (const rule of CO_OCCURRENCE_RULES) {
        for (const companion of rule.companions) {
          expect(companion.reason).toBeDefined();
          expect(companion.reason.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('MAX_SUGGESTIONS_PER_SESSION', () => {
    it('equals 2 as per requirement 6.2', () => {
      expect(MAX_SUGGESTIONS_PER_SESSION).toBe(2);
    });
  });
});
