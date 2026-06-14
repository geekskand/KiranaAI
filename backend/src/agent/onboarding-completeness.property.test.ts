/**
 * Property-Based Test: Onboarding Completeness (Property 7)
 *
 * For any completed onboarding flow, the resulting Preference Graph SHALL contain
 * at least one brand loyalty score, at least one dietary flag or quality preference,
 * and the onboarding question count SHALL be between 3 and 5.
 *
 * **Validates: Requirements 3.2, 3.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createOnboardingState,
  advanceOnboardingState,
  collectOnboardingPreferences,
  ONBOARDING_QUESTIONS,
} from './onboarding.js';
import type { OnboardingState } from '../models/index.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Q0 (dietary): arbitrary combination of dietary terms */
const dietaryAnswerArb = fc
  .subarray(
    ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'low-sugar', 'organic-only', 'plant-based', 'no gluten', 'no dairy'],
    { minLength: 1, maxLength: 4 }
  )
  .map((terms) => terms.join(', '));

/** Q1 (budget): arbitrary budget-related word */
const budgetAnswerArb = fc.constantFrom(
  'budget',
  'budget-conscious',
  'affordable',
  'save money',
  'moderate',
  'somewhere in the middle',
  'premium',
  'high-end',
  'luxury',
  'quality'
);

/** Q2 (brands): arbitrary brand names, possibly with categories */
const brandAnswerArb = fc.oneof(
  // Brand with category
  fc
    .tuple(
      fc.constantFrom('Amul', 'Tata', 'Haldirams', 'Britannia', 'Nestle', 'ITC', 'Dabur', 'Patanjali'),
      fc.constantFrom('dairy', 'snacks', 'beverages', 'staples', 'personal-care', 'grains')
    )
    .map(([brand, category]) => `${brand} for ${category}`),
  // Multiple brands comma-separated
  fc
    .subarray(
      ['Amul', 'Tata', 'Haldirams', 'Britannia', 'Nestle', 'ITC', 'Dabur', 'Patanjali', 'Fortune', 'MDH'],
      { minLength: 1, maxLength: 4 }
    )
    .map((brands) => brands.join(', ')),
  // Brand with parenthetical category
  fc
    .tuple(
      fc.constantFrom('Amul', 'Tata', 'Nestle', 'Britannia'),
      fc.constantFrom('dairy', 'beverages', 'snacks')
    )
    .map(([brand, cat]) => `${brand} (${cat})`)
);

/** Q3 (categories): arbitrary grocery categories */
const categoriesAnswerArb = fc
  .subarray(
    ['dairy', 'snacks', 'beverages', 'fruits', 'vegetables', 'grains', 'bakery', 'meat', 'seafood', 'frozen', 'condiments', 'spices', 'breakfast'],
    { minLength: 1, maxLength: 5 }
  )
  .map((cats) => cats.join(', '));

/** Q4 (substitutions): arbitrary tolerance words */
const substitutionsAnswerArb = fc.constantFrom(
  'strict',
  'no substitutions please',
  'same brand only',
  'moderate',
  'depends on the situation',
  'flexible',
  'open to anything',
  "don't mind",
  'whatever works'
);

/** Combined generator for all 5 answers in order */
const allAnswersArb = fc.tuple(
  dietaryAnswerArb,
  budgetAnswerArb,
  brandAnswerArb,
  categoriesAnswerArb,
  substitutionsAnswerArb
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 7: Onboarding Completeness', () => {
  it('completed onboarding has questionsAsked between 3 and 5 and complete === true', () => {
    fc.assert(
      fc.property(allAnswersArb, (answers) => {
        let state: OnboardingState = createOnboardingState();

        // Run the full onboarding flow
        for (const answer of answers) {
          state = advanceOnboardingState(state, answer);
        }

        // questionsAsked must be between 3 and 5
        expect(state.questionsAsked).toBeGreaterThanOrEqual(3);
        expect(state.questionsAsked).toBeLessThanOrEqual(5);

        // Onboarding must be complete
        expect(state.complete).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('completed onboarding produces at least one brand loyalty score', () => {
    fc.assert(
      fc.property(allAnswersArb, (answers) => {
        let state: OnboardingState = createOnboardingState();

        for (const answer of answers) {
          state = advanceOnboardingState(state, answer);
        }

        const prefs = collectOnboardingPreferences(state);

        // At least one brand loyalty score
        expect(prefs.brandLoyalty).toBeDefined();
        expect(prefs.brandLoyalty!.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 200 }
    );
  });

  it('completed onboarding produces at least one dietary flag or quality preference', () => {
    fc.assert(
      fc.property(allAnswersArb, (answers) => {
        let state: OnboardingState = createOnboardingState();

        for (const answer of answers) {
          state = advanceOnboardingState(state, answer);
        }

        const prefs = collectOnboardingPreferences(state);

        // At least one dietary flag OR quality preference
        const hasDietaryFlags = (prefs.dietaryFlags?.length ?? 0) > 0;
        const hasQualityPrefs = (prefs.qualityPreferences?.length ?? 0) > 0;

        expect(hasDietaryFlags || hasQualityPrefs).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('the onboarding questions total is between 3 and 5', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const state = createOnboardingState();

        // The total number of questions must be between 3 and 5
        expect(state.questionsTotal).toBeGreaterThanOrEqual(3);
        expect(state.questionsTotal).toBeLessThanOrEqual(5);

        // Must also match ONBOARDING_QUESTIONS length
        expect(state.questionsTotal).toBe(ONBOARDING_QUESTIONS.length);
      }),
      { numRuns: 10 }
    );
  });
});
