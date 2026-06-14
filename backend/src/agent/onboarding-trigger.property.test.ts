/**
 * Property-Based Test: Cold-Start Onboarding Trigger (Property 6)
 *
 * For any user with no existing Preference Graph data, the first agent response
 * in a new session SHALL be an onboarding question.
 *
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isColdStartUser,
  generateOnboardingResponse,
  createOnboardingState,
} from './onboarding.js';
import type {
  UserProfile,
  DietaryFlag,
  BrandLoyaltyEntry,
  QualityPreference,
} from '../models/index.js';

// ─── Generators ──────────────────────────────────────────────────────────────

const VALID_DIETARY_FLAGS: DietaryFlag[] = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'low-sugar',
  'organic-only',
];

/** Generator for a cold-start user profile (null or empty preference arrays) */
const coldStartProfileArb: fc.Arbitrary<UserProfile | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    dietaryFlags: fc.constant([] as DietaryFlag[]),
    brandLoyalty: fc.constant([] as BrandLoyaltyEntry[]),
    qualityPreferences: fc.constant([] as QualityPreference[]),
    createdAt: fc.integer({ min: 0 }),
    updatedAt: fc.integer({ min: 0 }),
  })
);

/** Generator for a non-empty dietary flags array */
const nonEmptyDietaryFlagsArb: fc.Arbitrary<DietaryFlag[]> = fc
  .subarray(VALID_DIETARY_FLAGS, { minLength: 1 })
  .map((flags) => flags as DietaryFlag[]);

/** Generator for a non-empty brand loyalty array */
const nonEmptyBrandLoyaltyArb: fc.Arbitrary<BrandLoyaltyEntry[]> = fc.array(
  fc.record({
    category: fc.stringOf(fc.constantFrom('dairy', 'snacks', 'beverages', 'staples'), { minLength: 1 }),
    brand: fc.string({ minLength: 1, maxLength: 20 }),
    score: fc.integer({ min: 0, max: 100 }),
    lastUpdated: fc.integer({ min: 0 }),
  }),
  { minLength: 1, maxLength: 5 }
);

/** Generator for a non-empty quality preferences array */
const nonEmptyQualityPrefsArb: fc.Arbitrary<QualityPreference[]> = fc.array(
  fc.record({
    category: fc.stringOf(fc.constantFrom('dairy', 'snacks', 'beverages', 'staples'), { minLength: 1 }),
    toleranceLevel: fc.constantFrom('strict', 'moderate', 'flexible') as fc.Arbitrary<'strict' | 'moderate' | 'flexible'>,
    priceWeight: fc.double({ min: 0, max: 1, noNaN: true }),
    brandWeight: fc.double({ min: 0, max: 1, noNaN: true }),
  }),
  { minLength: 1, maxLength: 5 }
);

/** Generator for a profile with at least one non-empty preference field */
const nonColdStartProfileArb: fc.Arbitrary<UserProfile> = fc.oneof(
  // Has dietary flags
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    dietaryFlags: nonEmptyDietaryFlagsArb,
    brandLoyalty: fc.constant([] as BrandLoyaltyEntry[]),
    qualityPreferences: fc.constant([] as QualityPreference[]),
    createdAt: fc.integer({ min: 0 }),
    updatedAt: fc.integer({ min: 0 }),
  }),
  // Has brand loyalty
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    dietaryFlags: fc.constant([] as DietaryFlag[]),
    brandLoyalty: nonEmptyBrandLoyaltyArb,
    qualityPreferences: fc.constant([] as QualityPreference[]),
    createdAt: fc.integer({ min: 0 }),
    updatedAt: fc.integer({ min: 0 }),
  }),
  // Has quality preferences
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    dietaryFlags: fc.constant([] as DietaryFlag[]),
    brandLoyalty: fc.constant([] as BrandLoyaltyEntry[]),
    qualityPreferences: nonEmptyQualityPrefsArb,
    createdAt: fc.integer({ min: 0 }),
    updatedAt: fc.integer({ min: 0 }),
  })
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 6: Cold-Start Onboarding Trigger', () => {
  it('cold-start users (null or empty preference data) are detected by isColdStartUser', () => {
    fc.assert(
      fc.property(coldStartProfileArb, (profile) => {
        expect(isColdStartUser(profile)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('cold-start users receive an onboarding question as first response', () => {
    fc.assert(
      fc.property(coldStartProfileArb, (profile) => {
        // Confirm this is a cold-start user
        expect(isColdStartUser(profile)).toBe(true);

        // Generate the first onboarding response
        const state = createOnboardingState();
        const response = generateOnboardingResponse(state);

        // The response must contain a question mark (an onboarding question was asked)
        expect(response.content).toContain('?');

        // The response must contain "Welcome" or "dietary" (first question keyword)
        const hasWelcome = response.content.includes('Welcome');
        const hasDietary = response.content.includes('dietary');
        expect(hasWelcome || hasDietary).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('users with any preference data are NOT cold-start users', () => {
    fc.assert(
      fc.property(nonColdStartProfileArb, (profile) => {
        expect(isColdStartUser(profile)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });
});
