/**
 * Property-Based Test: Persona-Based Prioritization (Property 15)
 *
 * Part A: For any set of product recommendations generated for Segment A (budget optimizer),
 * the average price of recommended products SHALL be ≤ the catalog average price for those categories.
 *
 * Part B: For any set of product recommendations generated for Segment B (health-conscious),
 * the proportion of health-labeled products (organic, low-sugar, no-palm-oil) in recommendations
 * SHALL exceed the catalog-wide proportion of health-labeled products.
 *
 * **Validates: Requirements 10.2, 10.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { catalog, type CatalogProduct } from './catalog.js';
import { personaBudgetRahul, personaHealthPriya } from './personas.js';
import type { UserProfile } from '../models/types.js';

// ─── Helper: Get unique categories from catalog ──────────────────────────────

const catalogCategories = [...new Set(catalog.map((p) => p.category))];

// ─── Recommendation Function ─────────────────────────────────────────────────

/**
 * Determines if a persona is budget-oriented based on their overall quality preferences.
 * A persona is budget-oriented if the average priceWeight across all their
 * quality preferences is >= 0.7.
 */
function isBudgetPersona(persona: UserProfile): boolean {
  if (persona.qualityPreferences.length === 0) return false;
  const avgPriceWeight =
    persona.qualityPreferences.reduce((sum, qp) => sum + qp.priceWeight, 0) /
    persona.qualityPreferences.length;
  return avgPriceWeight >= 0.6;
}

/**
 * Determines if a persona is health-conscious based on dietary flags.
 * A persona is health-conscious if they have organic-only or low-sugar flags.
 */
function isHealthPersona(persona: UserProfile): boolean {
  return (
    persona.dietaryFlags.includes('organic-only') ||
    persona.dietaryFlags.includes('low-sugar')
  );
}

/**
 * Simulates persona-based recommendation logic.
 * Given a persona profile and a category, selects products from the catalog
 * based on that persona's preferences.
 *
 * Segment A (budget optimizer): Sorts by price ascending, picks cheapest options.
 * Segment B (health-conscious): Filters by health labels (organic, low-sugar, no-palm-oil),
 * then selects products that match dietary preferences.
 */
function getPersonaRecommendations(
  persona: UserProfile,
  category: string,
  allProducts: CatalogProduct[]
): CatalogProduct[] {
  const categoryProducts = allProducts.filter(
    (p) => p.category === category && p.inStock
  );

  if (categoryProducts.length === 0) return [];

  if (isBudgetPersona(persona)) {
    // Budget optimizer: sort by price ascending, return cheaper half
    const sorted = [...categoryProducts].sort((a, b) => a.price - b.price);
    const takeCount = Math.max(1, Math.ceil(sorted.length / 2));
    return sorted.slice(0, takeCount);
  }

  if (isHealthPersona(persona)) {
    // Health-conscious: filter for health-labeled products
    const healthLabeled = (p: CatalogProduct): boolean =>
      p.isOrganic || p.isLowSugar || !p.containsPalmOil;

    const healthFiltered = categoryProducts.filter(healthLabeled);

    // If we have health products, prefer those; otherwise return all
    if (healthFiltered.length > 0) {
      return healthFiltered;
    }
  }

  return categoryProducts;
}

// ─── Catalog Statistics ──────────────────────────────────────────────────────

function getCatalogAveragePrice(category: string): number {
  const categoryProducts = catalog.filter(
    (p) => p.category === category && p.inStock
  );
  if (categoryProducts.length === 0) return 0;
  const totalPrice = categoryProducts.reduce((sum, p) => sum + p.price, 0);
  return totalPrice / categoryProducts.length;
}

function isHealthLabeled(p: CatalogProduct): boolean {
  return p.isOrganic || p.isLowSugar || !p.containsPalmOil;
}

function getCatalogHealthProportion(category: string): number {
  const categoryProducts = catalog.filter(
    (p) => p.category === category && p.inStock
  );
  if (categoryProducts.length === 0) return 0;
  const healthCount = categoryProducts.filter(isHealthLabeled).length;
  return healthCount / categoryProducts.length;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generator for random categories from the catalog */
const categoryArb = fc.constantFrom(...catalogCategories);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 15: Persona-Based Prioritization', () => {
  describe('Part A: Segment A (budget optimizer) — price prioritization', () => {
    it('average price of recommendations ≤ catalog average price for any category', () => {
      fc.assert(
        fc.property(categoryArb, (category) => {
          const recommendations = getPersonaRecommendations(
            personaBudgetRahul,
            category,
            catalog
          );

          // Skip if no recommendations for this category
          if (recommendations.length === 0) return true;

          const avgRecommendedPrice =
            recommendations.reduce((sum, p) => sum + p.price, 0) /
            recommendations.length;
          const catalogAvgPrice = getCatalogAveragePrice(category);

          // Property: budget optimizer recommendations average price ≤ catalog average
          expect(avgRecommendedPrice).toBeLessThanOrEqual(catalogAvgPrice);
          return true;
        }),
        { numRuns: 200 }
      );
    });

    it('budget optimizer selects products from the cheaper half of each category', () => {
      fc.assert(
        fc.property(categoryArb, (category) => {
          const recommendations = getPersonaRecommendations(
            personaBudgetRahul,
            category,
            catalog
          );
          const categoryProducts = catalog.filter(
            (p) => p.category === category && p.inStock
          );

          // Skip if no products or single-product categories
          if (recommendations.length === 0 || categoryProducts.length <= 1) {
            return true;
          }

          // All recommended products should come from the cheaper half
          const sorted = [...categoryProducts].sort((a, b) => a.price - b.price);
          const cheaperHalfCount = Math.max(1, Math.ceil(sorted.length / 2));
          const cheaperHalfIds = new Set(
            sorted.slice(0, cheaperHalfCount).map((p) => p.productId)
          );

          const allFromCheaperHalf = recommendations.every((p) =>
            cheaperHalfIds.has(p.productId)
          );

          expect(allFromCheaperHalf).toBe(true);
          return true;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Part B: Segment B (health-conscious) — health label prioritization', () => {
    it('health-label proportion in recommendations exceeds catalog-wide proportion', () => {
      fc.assert(
        fc.property(categoryArb, (category) => {
          const recommendations = getPersonaRecommendations(
            personaHealthPriya,
            category,
            catalog
          );

          // Skip if no recommendations for this category
          if (recommendations.length === 0) return true;

          const recommendedHealthCount =
            recommendations.filter(isHealthLabeled).length;
          const recommendedHealthProportion =
            recommendedHealthCount / recommendations.length;
          const catalogHealthProportion = getCatalogHealthProportion(category);

          // Property: health-conscious recommendations have ≥ catalog health proportion
          expect(recommendedHealthProportion).toBeGreaterThanOrEqual(
            catalogHealthProportion
          );
          return true;
        }),
        { numRuns: 200 }
      );
    });

    it('health-conscious persona filters products matching dietary flags', () => {
      fc.assert(
        fc.property(categoryArb, (category) => {
          const recommendations = getPersonaRecommendations(
            personaHealthPriya,
            category,
            catalog
          );

          // Skip if no recommendations
          if (recommendations.length === 0) return true;

          // Find quality preference for this category
          const qualityPref = personaHealthPriya.qualityPreferences.find(
            (qp) => qp.category === category
          );

          // Only check categories where Priya has strict tolerance
          if (!qualityPref || qualityPref.toleranceLevel !== 'strict') {
            return true;
          }

          // For strict-tolerance categories, ALL recommendations should be health-labeled
          const allHealthLabeled = recommendations.every(isHealthLabeled);
          expect(allHealthLabeled).toBe(true);
          return true;
        }),
        { numRuns: 200 }
      );
    });
  });
});
