/**
 * Quality Tolerance Engine — Rule-based substitution scoring.
 *
 * Computes how acceptable a substitute product is for a given user
 * based on brand match, category match, price deviation, dietary
 * compliance, and the user's quality tolerance level.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import type { Product, UserProfile, QualityToleranceResult } from '../models/types.js';
import { ACCEPTANCE_THRESHOLD } from '../models/types.js';

// ─── Factor Weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  brandMatch: 0.2,
  categoryMatch: 0.15,
  priceDeviation: 0.25,
  dietaryCompliance: 0.25,
  qualityLevel: 0.15,
} as const;

// ─── Tolerance Level Scores ──────────────────────────────────────────────────

const TOLERANCE_SCORES: Record<'strict' | 'moderate' | 'flexible', number> = {
  strict: 0.5,
  moderate: 0.75,
  flexible: 1.0,
};

// ─── Factor Computation ──────────────────────────────────────────────────────

/**
 * Brand match factor:
 * - 1.0 if same brand
 * - loyaltyScore/100 if user has loyalty to the substitute brand
 * - 0.3 otherwise
 */
function computeBrandMatch(original: Product, substitute: Product, userProfile: UserProfile): number {
  if (substitute.brand === original.brand) {
    return 1.0;
  }

  const loyaltyEntry = userProfile.brandLoyalty.find(
    (entry) => entry.brand === substitute.brand && entry.category === original.category
  );

  if (loyaltyEntry) {
    return loyaltyEntry.score / 100;
  }

  return 0.3;
}

/**
 * Category match factor:
 * - 1.0 if same category
 * - 0.2 otherwise
 */
function computeCategoryMatch(original: Product, substitute: Product): number {
  return substitute.category === original.category ? 1.0 : 0.2;
}

/**
 * Price deviation factor:
 * - 1.0 if substitute price <= original price
 * - Decreases linearly as price increases: 1 - (priceIncrease / originalPrice)
 * - Minimum of 0
 */
function computePriceDeviation(original: Product, substitute: Product): number {
  if (substitute.price <= original.price) {
    return 1.0;
  }

  const priceIncrease = substitute.price - original.price;
  const deviation = 1 - priceIncrease / original.price;
  return Math.max(0, deviation);
}

/**
 * Dietary compliance factor:
 * - 1.0 if substitute meets all user dietary requirements
 * - 0.0 if any dietary flag is violated (hard constraint)
 *
 * Dietary flags map to required product labels.
 */
function computeDietaryCompliance(substitute: Product, userProfile: UserProfile): number {
  if (userProfile.dietaryFlags.length === 0) {
    return 1.0;
  }

  const substituteLabels = new Set(substitute.labels.map((l) => l.toLowerCase()));

  for (const flag of userProfile.dietaryFlags) {
    if (!substituteLabels.has(flag)) {
      return 0.0;
    }
  }

  return 1.0;
}

/**
 * Quality level factor:
 * Based on user's tolerance level for the original product's category.
 * - strict: 0.5
 * - moderate: 0.75
 * - flexible: 1.0
 * Defaults to moderate if no preference is set.
 */
function computeQualityLevel(original: Product, userProfile: UserProfile): number {
  const qualityPref = userProfile.qualityPreferences.find(
    (pref) => pref.category === original.category
  );

  const toleranceLevel = qualityPref?.toleranceLevel ?? 'moderate';
  return TOLERANCE_SCORES[toleranceLevel];
}

// ─── Main Scoring Function ───────────────────────────────────────────────────

/**
 * Compute the quality tolerance score for a product substitution.
 *
 * The weighted score determines whether a substitute is acceptable:
 * - Score >= ACCEPTANCE_THRESHOLD (0.6): acceptable
 * - Score < ACCEPTANCE_THRESHOLD: rejected
 */
export function computeQualityTolerance(
  original: Product,
  substitute: Product,
  userProfile: UserProfile
): QualityToleranceResult {
  const factors = {
    brandMatch: computeBrandMatch(original, substitute, userProfile),
    categoryMatch: computeCategoryMatch(original, substitute),
    priceDeviation: computePriceDeviation(original, substitute),
    dietaryCompliance: computeDietaryCompliance(substitute, userProfile),
    qualityLevel: computeQualityLevel(original, userProfile),
  };

  const score =
    factors.brandMatch * WEIGHTS.brandMatch +
    factors.categoryMatch * WEIGHTS.categoryMatch +
    factors.priceDeviation * WEIGHTS.priceDeviation +
    factors.dietaryCompliance * WEIGHTS.dietaryCompliance +
    factors.qualityLevel * WEIGHTS.qualityLevel;

  const acceptable = score >= ACCEPTANCE_THRESHOLD;

  const reasons: string[] = [];

  if (factors.brandMatch >= 0.8) {
    reasons.push('Brand match is strong');
  } else if (factors.brandMatch <= 0.3) {
    reasons.push('Brand mismatch — unknown or non-preferred brand');
  }

  if (factors.categoryMatch < 1.0) {
    reasons.push('Category mismatch — substitute is in a different category');
  }

  if (factors.priceDeviation < 0.7) {
    reasons.push('Significant price increase over original');
  } else if (factors.priceDeviation < 1.0) {
    reasons.push('Moderate price increase over original');
  }

  if (factors.dietaryCompliance === 0.0) {
    reasons.push('Dietary restriction violated — hard reject');
  }

  if (factors.qualityLevel <= 0.5) {
    reasons.push('User has strict quality tolerance for this category');
  }

  return {
    score,
    acceptable,
    reasons,
    factors,
  };
}

export { ACCEPTANCE_THRESHOLD, WEIGHTS, TOLERANCE_SCORES };
