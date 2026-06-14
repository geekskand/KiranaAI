/**
 * Property-Based Test: Dietary Restriction Enforcement (Property 4)
 *
 * For any user with a dietary restriction flag set, all product recommendations
 * returned by the system SHALL comply with that dietary restriction (no products
 * violating the flag appear in recommendations).
 *
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  filterByDietaryRestrictions,
  filterCardsByDietaryRestrictions,
  filterSuggestionsByDietaryRestrictions,
} from './orchestrator.js';
import type { Product, ProductCard, ProductSuggestion, DietaryFlag } from '../models/index.js';

// ─── Dietary Violation Helpers ───────────────────────────────────────────────

/**
 * Labels that violate each dietary flag — mirrors the DIETARY_EXCLUSION_MAP logic.
 */
const VIOLATING_LABELS: Record<DietaryFlag, string[]> = {
  vegetarian: ['non-veg', 'non-vegetarian', 'meat', 'chicken', 'fish', 'seafood', 'egg'],
  vegan: [
    'non-veg', 'non-vegetarian', 'meat', 'chicken', 'fish', 'seafood',
    'egg', 'dairy', 'milk', 'cheese', 'butter', 'ghee', 'paneer', 'curd',
  ],
  'gluten-free': ['gluten', 'wheat', 'contains-gluten'],
  'dairy-free': ['dairy', 'milk', 'cheese', 'butter', 'ghee', 'paneer', 'curd'],
  'low-sugar': ['high-sugar', 'sugar-heavy', 'sweetened'],
  'organic-only': [], // special: violation is ABSENCE of 'organic' label
};

/** Categories that violate specific flags */
const VIOLATING_CATEGORIES: Partial<Record<DietaryFlag, string[]>> = {
  vegan: ['dairy'],
  'dairy-free': ['dairy'],
};

/**
 * Check if a product violates a given dietary flag.
 * This is an independent re-implementation of the violation logic for verification.
 */
function productViolatesFlag(product: Product, flag: DietaryFlag): boolean {
  // Check label-based violations
  const violatingLabels = VIOLATING_LABELS[flag];
  const hasViolatingLabel = product.labels.some((l) =>
    violatingLabels.includes(l.toLowerCase())
  );
  if (hasViolatingLabel) return true;

  // Check category-based violations
  const violatingCats = VIOLATING_CATEGORIES[flag];
  if (violatingCats && violatingCats.includes(product.category.toLowerCase())) {
    return true;
  }

  // Special case: organic-only means product MUST have 'organic' label
  if (flag === 'organic-only') {
    return !product.labels.some((l) => l.toLowerCase() === 'organic');
  }

  return false;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** All possible dietary flags */
const ALL_DIETARY_FLAGS: DietaryFlag[] = [
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'low-sugar', 'organic-only',
];

/** Generator for a dietary flag */
const dietaryFlagArb: fc.Arbitrary<DietaryFlag> = fc.constantFrom(...ALL_DIETARY_FLAGS);

/** Generator for a non-empty array of dietary flags */
const dietaryFlagsArb: fc.Arbitrary<DietaryFlag[]> = fc.uniqueArray(dietaryFlagArb, {
  minLength: 1,
  maxLength: ALL_DIETARY_FLAGS.length,
});

/** All possible violating labels (for generating products that may or may not violate) */
const ALL_VIOLATING_LABELS = [
  'non-veg', 'non-vegetarian', 'meat', 'chicken', 'fish', 'seafood', 'egg',
  'dairy', 'milk', 'cheese', 'butter', 'ghee', 'paneer', 'curd',
  'gluten', 'wheat', 'contains-gluten',
  'high-sugar', 'sugar-heavy', 'sweetened',
  'organic',
];

/** Generator for safe/neutral labels */
const safeLabelArb = fc.constantFrom(
  'fresh', 'premium', 'value', 'organic', 'local', 'imported', 'natural'
);

/** Generator for potentially violating labels */
const anyLabelArb = fc.constantFrom(...ALL_VIOLATING_LABELS, 'organic', 'fresh', 'premium', 'local');

/** Generator for product categories */
const categoryArb = fc.constantFrom(
  'staples', 'dairy', 'bakery', 'snacks', 'beverages', 'vegetables',
  'fruits', 'personal-care', 'household', 'spreads', 'sauces', 'meat'
);

/** Generator for a product with arbitrary labels and category */
const productArb: fc.Arbitrary<Product> = fc.record({
  productId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  price: fc.integer({ min: 10, max: 1000 }),
  category: categoryArb,
  brand: fc.constantFrom('Amul', 'Tata', 'Local', 'Organic Farm', 'Nestle', 'Fortune'),
  labels: fc.array(anyLabelArb, { minLength: 0, maxLength: 5 }),
  imageUrl: fc.constant(undefined),
});

/** Generator for a list of products */
const productsArb: fc.Arbitrary<Product[]> = fc.array(productArb, {
  minLength: 0,
  maxLength: 20,
});

/** Generator for a product card */
const productCardArb = (catalog: Product[]): fc.Arbitrary<ProductCard> => {
  if (catalog.length === 0) {
    return fc.record({
      productId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      price: fc.integer({ min: 10, max: 1000 }),
      imageUrl: fc.constant(undefined),
      reason: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    });
  }
  return fc.constantFrom(...catalog).map((p) => ({
    productId: p.productId,
    name: p.name,
    price: p.price,
    imageUrl: p.imageUrl,
    reason: undefined,
  }));
};

/** Generator for a product suggestion */
const productSuggestionArb: fc.Arbitrary<ProductSuggestion> = productArb.map((p) => ({
  product: p,
  reason: 'Test suggestion',
  confidence: 0.8,
}));

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 4: Dietary Restriction Enforcement', () => {
  describe('filterByDietaryRestrictions', () => {
    it('no product in filtered output violates any of the user dietary flags', () => {
      fc.assert(
        fc.property(productsArb, dietaryFlagsArb, (products, flags) => {
          const filtered = filterByDietaryRestrictions(products, flags);

          // Core property: every product in the output must NOT violate ANY flag
          for (const product of filtered) {
            for (const flag of flags) {
              expect(productViolatesFlag(product, flag)).toBe(false);
            }
          }
        }),
        { numRuns: 300 }
      );
    });

    it('filtered output is a subset of the input products', () => {
      fc.assert(
        fc.property(productsArb, dietaryFlagsArb, (products, flags) => {
          const filtered = filterByDietaryRestrictions(products, flags);

          // Every product in the output must exist in the input
          for (const product of filtered) {
            expect(products).toContain(product);
          }
          // Output length is at most input length
          expect(filtered.length).toBeLessThanOrEqual(products.length);
        }),
        { numRuns: 300 }
      );
    });

    it('with no dietary flags, all products pass through unchanged', () => {
      fc.assert(
        fc.property(productsArb, (products) => {
          const filtered = filterByDietaryRestrictions(products, []);
          expect(filtered).toEqual(products);
        }),
        { numRuns: 100 }
      );
    });

    it('compliant products are never removed', () => {
      fc.assert(
        fc.property(productsArb, dietaryFlagsArb, (products, flags) => {
          const filtered = filterByDietaryRestrictions(products, flags);

          // Any product that does NOT violate any flag must remain in the output
          for (const product of products) {
            const violatesAny = flags.some((flag) => productViolatesFlag(product, flag));
            if (!violatesAny) {
              expect(filtered).toContain(product);
            }
          }
        }),
        { numRuns: 300 }
      );
    });
  });

  describe('filterCardsByDietaryRestrictions', () => {
    it('no product card in filtered output corresponds to a violating product in catalog', () => {
      fc.assert(
        fc.property(productsArb, dietaryFlagsArb, (catalog, flags) => {
          // Generate product cards from the catalog
          const cards: ProductCard[] = catalog.map((p) => ({
            productId: p.productId,
            name: p.name,
            price: p.price,
            imageUrl: p.imageUrl,
            reason: undefined,
          }));

          const filtered = filterCardsByDietaryRestrictions(cards, flags, catalog);

          // Core property: no card in output references a violating product
          for (const card of filtered) {
            const product = catalog.find((p) => p.productId === card.productId);
            if (product) {
              for (const flag of flags) {
                expect(productViolatesFlag(product, flag)).toBe(false);
              }
            }
          }
        }),
        { numRuns: 300 }
      );
    });

    it('cards not found in catalog are preserved (fail-open)', () => {
      fc.assert(
        fc.property(productsArb, dietaryFlagsArb, (catalog, flags) => {
          // Create a card that doesn't match any product in the catalog
          const unknownCard: ProductCard = {
            productId: 'unknown-product-xyz-999',
            name: 'Mystery Product',
            price: 100,
          };

          const cards: ProductCard[] = [unknownCard];
          const filtered = filterCardsByDietaryRestrictions(cards, flags, catalog);

          // Unknown cards should pass through (fail-open behavior)
          expect(filtered).toContain(unknownCard);
        }),
        { numRuns: 100 }
      );
    });

    it('with no dietary flags, all cards pass through unchanged', () => {
      fc.assert(
        fc.property(productsArb, (catalog) => {
          const cards: ProductCard[] = catalog.map((p) => ({
            productId: p.productId,
            name: p.name,
            price: p.price,
          }));

          const filtered = filterCardsByDietaryRestrictions(cards, [], catalog);
          expect(filtered).toEqual(cards);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('filterSuggestionsByDietaryRestrictions', () => {
    it('no suggestion in filtered output has a product violating any dietary flag', () => {
      fc.assert(
        fc.property(
          fc.array(productSuggestionArb, { minLength: 0, maxLength: 15 }),
          dietaryFlagsArb,
          (suggestions, flags) => {
            const filtered = filterSuggestionsByDietaryRestrictions(suggestions, flags);

            // Core property: every suggestion's product must NOT violate ANY flag
            for (const suggestion of filtered) {
              for (const flag of flags) {
                expect(productViolatesFlag(suggestion.product, flag)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    it('filtered suggestions are a subset of input suggestions', () => {
      fc.assert(
        fc.property(
          fc.array(productSuggestionArb, { minLength: 0, maxLength: 15 }),
          dietaryFlagsArb,
          (suggestions, flags) => {
            const filtered = filterSuggestionsByDietaryRestrictions(suggestions, flags);

            for (const suggestion of filtered) {
              expect(suggestions).toContain(suggestion);
            }
            expect(filtered.length).toBeLessThanOrEqual(suggestions.length);
          }
        ),
        { numRuns: 300 }
      );
    });

    it('with no dietary flags, all suggestions pass through unchanged', () => {
      fc.assert(
        fc.property(
          fc.array(productSuggestionArb, { minLength: 0, maxLength: 10 }),
          (suggestions) => {
            const filtered = filterSuggestionsByDietaryRestrictions(suggestions, []);
            expect(filtered).toEqual(suggestions);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('compliant suggestions are never removed', () => {
      fc.assert(
        fc.property(
          fc.array(productSuggestionArb, { minLength: 0, maxLength: 15 }),
          dietaryFlagsArb,
          (suggestions, flags) => {
            const filtered = filterSuggestionsByDietaryRestrictions(suggestions, flags);

            for (const suggestion of suggestions) {
              const violatesAny = flags.some((flag) =>
                productViolatesFlag(suggestion.product, flag)
              );
              if (!violatesAny) {
                expect(filtered).toContain(suggestion);
              }
            }
          }
        ),
        { numRuns: 300 }
      );
    });
  });
});
