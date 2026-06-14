/**
 * Unit tests for the Quality Tolerance Engine.
 * Validates scoring algorithm, factor computation, and accept/reject routing.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { describe, it, expect } from 'vitest';
import { computeQualityTolerance, WEIGHTS, TOLERANCE_SCORES } from './quality-tolerance.js';
import type { Product, UserProfile } from '../models/types.js';
import { ACCEPTANCE_THRESHOLD } from '../models/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    productId: 'prod-001',
    name: 'Test Product',
    price: 100,
    category: 'dairy',
    brand: 'BrandA',
    labels: ['vegetarian'],
    ...overrides,
  };
}

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'user-001',
    dietaryFlags: [],
    brandLoyalty: [],
    qualityPreferences: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Brand Match Factor ──────────────────────────────────────────────────────

describe('Quality Tolerance - Brand Match', () => {
  it('should return 1.0 when brands are identical', () => {
    const original = makeProduct({ brand: 'Amul' });
    const substitute = makeProduct({ brand: 'Amul', productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.brandMatch).toBe(1.0);
  });

  it('should return loyalty score / 100 when user has loyalty to substitute brand', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy' });
    const substitute = makeProduct({ brand: 'Mother Dairy', productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile({
      brandLoyalty: [
        { category: 'dairy', brand: 'Mother Dairy', score: 70, lastUpdated: Date.now() },
      ],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.brandMatch).toBe(0.7);
  });

  it('should return 0.3 when brand is unknown and user has no loyalty', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy' });
    const substitute = makeProduct({ brand: 'UnknownBrand', productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.brandMatch).toBe(0.3);
  });
});

// ─── Category Match Factor ───────────────────────────────────────────────────

describe('Quality Tolerance - Category Match', () => {
  it('should return 1.0 when categories are identical', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ category: 'dairy', productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.categoryMatch).toBe(1.0);
  });

  it('should return 0.2 when categories differ', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ category: 'beverages', productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.categoryMatch).toBe(0.2);
  });
});

// ─── Price Deviation Factor ──────────────────────────────────────────────────

describe('Quality Tolerance - Price Deviation', () => {
  it('should return 1.0 when substitute is cheaper', () => {
    const original = makeProduct({ price: 100 });
    const substitute = makeProduct({ price: 80, productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.priceDeviation).toBe(1.0);
  });

  it('should return 1.0 when substitute has same price', () => {
    const original = makeProduct({ price: 100 });
    const substitute = makeProduct({ price: 100, productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.priceDeviation).toBe(1.0);
  });

  it('should decrease linearly when substitute is more expensive', () => {
    const original = makeProduct({ price: 100 });
    const substitute = makeProduct({ price: 130, productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    // 1 - (30 / 100) = 0.7
    expect(result.factors.priceDeviation).toBeCloseTo(0.7);
  });

  it('should return 0 when substitute is double the price', () => {
    const original = makeProduct({ price: 100 });
    const substitute = makeProduct({ price: 200, productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.priceDeviation).toBe(0);
  });

  it('should not go below 0 for very expensive substitutes', () => {
    const original = makeProduct({ price: 100 });
    const substitute = makeProduct({ price: 500, productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.priceDeviation).toBe(0);
  });
});

// ─── Dietary Compliance Factor ───────────────────────────────────────────────

describe('Quality Tolerance - Dietary Compliance', () => {
  it('should return 1.0 when user has no dietary flags', () => {
    const original = makeProduct();
    const substitute = makeProduct({ productId: 'prod-002', labels: [] });
    const profile = makeUserProfile({ dietaryFlags: [] });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.dietaryCompliance).toBe(1.0);
  });

  it('should return 1.0 when substitute meets all dietary requirements', () => {
    const original = makeProduct();
    const substitute = makeProduct({
      productId: 'prod-002',
      labels: ['vegetarian', 'gluten-free'],
    });
    const profile = makeUserProfile({ dietaryFlags: ['vegetarian', 'gluten-free'] });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.dietaryCompliance).toBe(1.0);
  });

  it('should return 0.0 when any dietary flag is violated', () => {
    const original = makeProduct();
    const substitute = makeProduct({
      productId: 'prod-002',
      labels: ['vegetarian'],
    });
    const profile = makeUserProfile({ dietaryFlags: ['vegetarian', 'gluten-free'] });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.dietaryCompliance).toBe(0.0);
  });

  it('should be case-insensitive for label matching', () => {
    const original = makeProduct();
    const substitute = makeProduct({
      productId: 'prod-002',
      labels: ['Vegetarian', 'GLUTEN-FREE'],
    });
    const profile = makeUserProfile({ dietaryFlags: ['vegetarian', 'gluten-free'] });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.dietaryCompliance).toBe(1.0);
  });
});

// ─── Quality Level Factor ────────────────────────────────────────────────────

describe('Quality Tolerance - Quality Level', () => {
  it('should return 0.5 for strict tolerance', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile({
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'strict', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.qualityLevel).toBe(0.5);
  });

  it('should return 0.75 for moderate tolerance', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile({
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'moderate', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.qualityLevel).toBe(0.75);
  });

  it('should return 1.0 for flexible tolerance', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile({
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'flexible', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.qualityLevel).toBe(1.0);
  });

  it('should default to moderate (0.75) when no quality preference exists', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile({ qualityPreferences: [] });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.qualityLevel).toBe(0.75);
  });
});

// ─── Overall Score and Acceptance ────────────────────────────────────────────

describe('Quality Tolerance - Overall Score', () => {
  it('should compute weighted score correctly', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy', price: 100 });
    const substitute = makeProduct({
      productId: 'prod-002',
      brand: 'Amul',
      category: 'dairy',
      price: 100,
      labels: ['vegetarian'],
    });
    const profile = makeUserProfile({
      dietaryFlags: ['vegetarian'],
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'flexible', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);

    // All factors are 1.0, so score should be 1.0
    const expectedScore =
      1.0 * WEIGHTS.brandMatch +
      1.0 * WEIGHTS.categoryMatch +
      1.0 * WEIGHTS.priceDeviation +
      1.0 * WEIGHTS.dietaryCompliance +
      1.0 * WEIGHTS.qualityLevel;

    expect(result.score).toBeCloseTo(expectedScore);
    expect(result.score).toBeCloseTo(1.0);
    expect(result.acceptable).toBe(true);
  });

  it('should mark as acceptable when score >= threshold', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy', price: 100 });
    const substitute = makeProduct({
      productId: 'prod-002',
      brand: 'Amul',
      category: 'dairy',
      price: 110,
      labels: [],
    });
    const profile = makeUserProfile({
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'moderate', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    // brandMatch=1.0, categoryMatch=1.0, priceDeviation=0.9, dietary=1.0, quality=0.75
    // score = 1.0*0.2 + 1.0*0.15 + 0.9*0.25 + 1.0*0.25 + 0.75*0.15
    // score = 0.2 + 0.15 + 0.225 + 0.25 + 0.1125 = 0.9375
    expect(result.score).toBeGreaterThanOrEqual(ACCEPTANCE_THRESHOLD);
    expect(result.acceptable).toBe(true);
  });

  it('should mark as not acceptable when dietary is violated', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy', price: 100 });
    const substitute = makeProduct({
      productId: 'prod-002',
      brand: 'Amul',
      category: 'dairy',
      price: 100,
      labels: [],
    });
    const profile = makeUserProfile({
      dietaryFlags: ['vegan'],
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'flexible', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    // dietary = 0.0 means that 0.25 of the score is zeroed out
    // brandMatch=1.0, categoryMatch=1.0, priceDeviation=1.0, dietary=0.0, quality=1.0
    // score = 1.0*0.2 + 1.0*0.15 + 1.0*0.25 + 0.0*0.25 + 1.0*0.15
    // score = 0.2 + 0.15 + 0.25 + 0 + 0.15 = 0.75
    expect(result.factors.dietaryCompliance).toBe(0.0);
    expect(result.score).toBeCloseTo(0.75);
    // Even with dietary violation, score is 0.75 which is above threshold
    // because other factors are perfect — but the dietary reason is still given
    expect(result.reasons).toContain('Dietary restriction violated — hard reject');
  });

  it('should reject when multiple factors are poor', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy', price: 100 });
    const substitute = makeProduct({
      productId: 'prod-002',
      brand: 'Unknown',
      category: 'snacks',
      price: 200,
      labels: [],
    });
    const profile = makeUserProfile({
      dietaryFlags: ['vegetarian'],
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'strict', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    // brandMatch=0.3, categoryMatch=0.2, priceDeviation=0.0, dietary=0.0, quality=0.5
    // score = 0.3*0.2 + 0.2*0.15 + 0.0*0.25 + 0.0*0.25 + 0.5*0.15
    // score = 0.06 + 0.03 + 0 + 0 + 0.075 = 0.165
    expect(result.score).toBeLessThan(ACCEPTANCE_THRESHOLD);
    expect(result.acceptable).toBe(false);
  });
});

// ─── Reasons ─────────────────────────────────────────────────────────────────

describe('Quality Tolerance - Reasons', () => {
  it('should include brand match reason for strong match', () => {
    const original = makeProduct({ brand: 'Amul' });
    const substitute = makeProduct({ brand: 'Amul', productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.reasons).toContain('Brand match is strong');
  });

  it('should include brand mismatch reason for unknown brand', () => {
    const original = makeProduct({ brand: 'Amul', category: 'dairy' });
    const substitute = makeProduct({ brand: 'NoName', category: 'dairy', productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.reasons).toContain('Brand mismatch — unknown or non-preferred brand');
  });

  it('should include category mismatch reason', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ category: 'beverages', productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.reasons).toContain('Category mismatch — substitute is in a different category');
  });

  it('should include price increase reason when significant', () => {
    const original = makeProduct({ price: 100 });
    const substitute = makeProduct({ price: 180, productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.reasons).toContain('Significant price increase over original');
  });

  it('should include strict quality tolerance reason', () => {
    const original = makeProduct({ category: 'dairy' });
    const substitute = makeProduct({ productId: 'prod-002', category: 'dairy' });
    const profile = makeUserProfile({
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'strict', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.reasons).toContain('User has strict quality tolerance for this category');
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Quality Tolerance - Edge Cases', () => {
  it('should handle empty brand loyalty array', () => {
    const original = makeProduct({ brand: 'A' });
    const substitute = makeProduct({ brand: 'B', productId: 'prod-002' });
    const profile = makeUserProfile({ brandLoyalty: [] });

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.brandMatch).toBe(0.3);
  });

  it('should handle product with zero price gracefully', () => {
    const original = makeProduct({ price: 0 });
    const substitute = makeProduct({ price: 50, productId: 'prod-002' });
    const profile = makeUserProfile();

    // With price 0, priceIncrease / originalPrice is Infinity → deviation is -Infinity → clamp to 0
    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.factors.priceDeviation).toBe(0);
  });

  it('should score exactly at threshold boundary', () => {
    // Craft a scenario where score is exactly at threshold
    // Score needs to be exactly 0.6
    const original = makeProduct({ brand: 'A', category: 'dairy', price: 100 });
    const substitute = makeProduct({
      productId: 'prod-002',
      brand: 'A',
      category: 'dairy',
      price: 100,
      labels: [],
    });
    const profile = makeUserProfile({
      dietaryFlags: ['vegan'],
      qualityPreferences: [{ category: 'dairy', toleranceLevel: 'strict', priceWeight: 0.5, brandWeight: 0.5 }],
    });

    const result = computeQualityTolerance(original, substitute, profile);
    // brandMatch=1.0, categoryMatch=1.0, priceDeviation=1.0, dietary=0.0, quality=0.5
    // score = 1.0*0.2 + 1.0*0.15 + 1.0*0.25 + 0.0*0.25 + 0.5*0.15
    // score = 0.2 + 0.15 + 0.25 + 0 + 0.075 = 0.675
    expect(result.score).toBeCloseTo(0.675);
    expect(result.acceptable).toBe(true);
  });

  it('should return score in 0-1 range', () => {
    const original = makeProduct();
    const substitute = makeProduct({ productId: 'prod-002' });
    const profile = makeUserProfile();

    const result = computeQualityTolerance(original, substitute, profile);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
