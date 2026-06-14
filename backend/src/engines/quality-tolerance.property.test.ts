/**
 * Property-Based Test: Substitution Score Decision Routing (Property 9)
 *
 * Tests that the quality tolerance engine correctly routes decisions based
 * on the computed substitution score:
 * - When score >= ACCEPTANCE_THRESHOLD (0.6) → result.acceptable === true (suggest substitute)
 * - When score < ACCEPTANCE_THRESHOLD → result.acceptable === false (present shortlist)
 * - Score is always in range [0, 1]
 * - All individual factors are in range [0, 1]
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeQualityTolerance, ACCEPTANCE_THRESHOLD } from './quality-tolerance.js';
import type { Product, UserProfile, DietaryFlag } from '../models/types.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const dietaryFlagArb: fc.Arbitrary<DietaryFlag> = fc.oneof(
  fc.constant('vegetarian' as DietaryFlag),
  fc.constant('vegan' as DietaryFlag),
  fc.constant('gluten-free' as DietaryFlag),
  fc.constant('dairy-free' as DietaryFlag),
  fc.constant('low-sugar' as DietaryFlag),
  fc.constant('organic-only' as DietaryFlag)
);

const categoryArb = fc.oneof(
  fc.constant('dairy'),
  fc.constant('snacks'),
  fc.constant('beverages'),
  fc.constant('grains'),
  fc.constant('produce'),
  fc.constant('frozen'),
  fc.constant('bakery')
);

const brandArb = fc.oneof(
  fc.constant('Amul'),
  fc.constant('Mother Dairy'),
  fc.constant('Britannia'),
  fc.constant('Parle'),
  fc.constant('Tata'),
  fc.constant('Nestle'),
  fc.constant('Haldirams'),
  fc.constant('ITC')
);

const toleranceLevelArb = fc.oneof(
  fc.constant('strict' as const),
  fc.constant('moderate' as const),
  fc.constant('flexible' as const)
);

const productArb: fc.Arbitrary<Product> = fc.record({
  productId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  price: fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
  category: categoryArb,
  brand: brandArb,
  labels: fc.uniqueArray(dietaryFlagArb, { minLength: 0, maxLength: 6 }),
});

const userProfileArb: fc.Arbitrary<UserProfile> = fc.record({
  userId: fc.uuid(),
  dietaryFlags: fc.uniqueArray(dietaryFlagArb, { minLength: 0, maxLength: 6 }),
  brandLoyalty: fc.array(
    fc.record({
      category: categoryArb,
      brand: brandArb,
      score: fc.integer({ min: 0, max: 100 }),
      lastUpdated: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  qualityPreferences: fc.array(
    fc.record({
      category: categoryArb,
      toleranceLevel: toleranceLevelArb,
      priceWeight: fc.double({ min: 0, max: 1, noNaN: true }),
      brandWeight: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  createdAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
  updatedAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 9: Substitution Score Decision Routing', () => {
  it('when score >= ACCEPTANCE_THRESHOLD (0.6), result.acceptable is true (suggest substitute)', () => {
    fc.assert(
      fc.property(productArb, productArb, userProfileArb, (original, substitute, userProfile) => {
        const result = computeQualityTolerance(original, substitute, userProfile);

        if (result.score >= ACCEPTANCE_THRESHOLD) {
          expect(result.acceptable).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('when score < ACCEPTANCE_THRESHOLD (0.6), result.acceptable is false (present shortlist)', () => {
    fc.assert(
      fc.property(productArb, productArb, userProfileArb, (original, substitute, userProfile) => {
        const result = computeQualityTolerance(original, substitute, userProfile);

        if (result.score < ACCEPTANCE_THRESHOLD) {
          expect(result.acceptable).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('score is always in range [0, 1] for any valid input', () => {
    fc.assert(
      fc.property(productArb, productArb, userProfileArb, (original, substitute, userProfile) => {
        const result = computeQualityTolerance(original, substitute, userProfile);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 }
    );
  });

  it('all individual factors are in range [0, 1] for any valid input', () => {
    fc.assert(
      fc.property(productArb, productArb, userProfileArb, (original, substitute, userProfile) => {
        const result = computeQualityTolerance(original, substitute, userProfile);

        expect(result.factors.brandMatch).toBeGreaterThanOrEqual(0);
        expect(result.factors.brandMatch).toBeLessThanOrEqual(1);

        expect(result.factors.categoryMatch).toBeGreaterThanOrEqual(0);
        expect(result.factors.categoryMatch).toBeLessThanOrEqual(1);

        expect(result.factors.priceDeviation).toBeGreaterThanOrEqual(0);
        expect(result.factors.priceDeviation).toBeLessThanOrEqual(1);

        expect(result.factors.dietaryCompliance).toBeGreaterThanOrEqual(0);
        expect(result.factors.dietaryCompliance).toBeLessThanOrEqual(1);

        expect(result.factors.qualityLevel).toBeGreaterThanOrEqual(0);
        expect(result.factors.qualityLevel).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 }
    );
  });

  it('decision routing is consistent: acceptable is determined solely by score vs threshold', () => {
    fc.assert(
      fc.property(productArb, productArb, userProfileArb, (original, substitute, userProfile) => {
        const result = computeQualityTolerance(original, substitute, userProfile);

        // The routing decision must be consistent with score
        const expectedAcceptable = result.score >= ACCEPTANCE_THRESHOLD;
        expect(result.acceptable).toBe(expectedAcceptable);
      }),
      { numRuns: 200 }
    );
  });
});
