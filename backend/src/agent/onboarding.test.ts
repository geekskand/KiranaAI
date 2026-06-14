/**
 * Unit tests for the onboarding flow logic.
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect } from 'vitest';
import {
  isColdStartUser,
  getNextOnboardingQuestion,
  parseOnboardingAnswer,
  generateOnboardingResponse,
  createOnboardingState,
  advanceOnboardingState,
  collectOnboardingPreferences,
  ONBOARDING_QUESTIONS,
} from './onboarding.js';
import type { UserProfile, OnboardingState } from '../models/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeEmptyProfile(userId = 'user-1'): UserProfile {
  return {
    userId,
    dietaryFlags: [],
    brandLoyalty: [],
    qualityPreferences: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makePopulatedProfile(userId = 'user-1'): UserProfile {
  return {
    userId,
    dietaryFlags: ['vegetarian'],
    brandLoyalty: [
      { category: 'dairy', brand: 'Amul', score: 80, lastUpdated: Date.now() },
    ],
    qualityPreferences: [
      { category: 'dairy', toleranceLevel: 'moderate', priceWeight: 0.5, brandWeight: 0.5 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── isColdStartUser ─────────────────────────────────────────────────────────

describe('isColdStartUser', () => {
  it('returns true for null profile', () => {
    expect(isColdStartUser(null)).toBe(true);
  });

  it('returns true for profile with no meaningful data', () => {
    const profile = makeEmptyProfile();
    expect(isColdStartUser(profile)).toBe(true);
  });

  it('returns false for profile with dietary flags', () => {
    const profile = makeEmptyProfile();
    profile.dietaryFlags = ['vegan'];
    expect(isColdStartUser(profile)).toBe(false);
  });

  it('returns false for profile with brand loyalty', () => {
    const profile = makeEmptyProfile();
    profile.brandLoyalty = [
      { category: 'snacks', brand: 'Lays', score: 60, lastUpdated: Date.now() },
    ];
    expect(isColdStartUser(profile)).toBe(false);
  });

  it('returns false for profile with quality preferences', () => {
    const profile = makeEmptyProfile();
    profile.qualityPreferences = [
      { category: 'dairy', toleranceLevel: 'strict', priceWeight: 0.3, brandWeight: 0.9 },
    ];
    expect(isColdStartUser(profile)).toBe(false);
  });

  it('returns false for fully populated profile', () => {
    expect(isColdStartUser(makePopulatedProfile())).toBe(false);
  });
});

// ─── getNextOnboardingQuestion ───────────────────────────────────────────────

describe('getNextOnboardingQuestion', () => {
  it('returns the first question when no questions asked', () => {
    const state = createOnboardingState();
    const question = getNextOnboardingQuestion(state);
    expect(question).toBe(ONBOARDING_QUESTIONS[0].text);
  });

  it('returns the second question after one answer', () => {
    const state: OnboardingState = {
      questionsAsked: 1,
      questionsTotal: 5,
      answers: { dietary: 'vegetarian' },
      complete: false,
    };
    const question = getNextOnboardingQuestion(state);
    expect(question).toBe(ONBOARDING_QUESTIONS[1].text);
  });

  it('returns null when all questions have been asked', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {},
      complete: false,
    };
    expect(getNextOnboardingQuestion(state)).toBeNull();
  });

  it('returns null when state is marked complete', () => {
    const state: OnboardingState = {
      questionsAsked: 3,
      questionsTotal: 5,
      answers: {},
      complete: true,
    };
    expect(getNextOnboardingQuestion(state)).toBeNull();
  });
});

// ─── parseOnboardingAnswer ───────────────────────────────────────────────────

describe('parseOnboardingAnswer', () => {
  describe('Q0: dietary preferences', () => {
    it('parses vegetarian', () => {
      const result = parseOnboardingAnswer(0, 'I am vegetarian');
      expect(result.dietaryFlags).toContain('vegetarian');
    });

    it('parses multiple dietary flags', () => {
      const result = parseOnboardingAnswer(0, 'I am vegan and gluten-free');
      expect(result.dietaryFlags).toContain('vegan');
      expect(result.dietaryFlags).toContain('gluten-free');
    });

    it('parses "no gluten" as gluten-free', () => {
      const result = parseOnboardingAnswer(0, 'no gluten for me');
      expect(result.dietaryFlags).toContain('gluten-free');
    });

    it('parses "plant-based" as vegan', () => {
      const result = parseOnboardingAnswer(0, 'I eat plant-based');
      expect(result.dietaryFlags).toContain('vegan');
    });

    it('parses organic preference', () => {
      const result = parseOnboardingAnswer(0, 'I prefer organic products');
      expect(result.dietaryFlags).toContain('organic-only');
    });

    it('returns undefined dietaryFlags for no matches', () => {
      const result = parseOnboardingAnswer(0, 'I eat everything');
      expect(result.dietaryFlags).toBeUndefined();
    });
  });

  describe('Q1: budget', () => {
    it('parses budget-conscious', () => {
      const result = parseOnboardingAnswer(1, 'I try to save money, budget is important');
      expect(result.budgetLevel).toBe('budget-conscious');
    });

    it('parses premium', () => {
      const result = parseOnboardingAnswer(1, 'I prefer premium quality items');
      expect(result.budgetLevel).toBe('premium');
    });

    it('defaults to moderate for ambiguous answers', () => {
      const result = parseOnboardingAnswer(1, 'somewhere in the middle');
      expect(result.budgetLevel).toBe('moderate');
    });

    it('generates quality preferences with high priceWeight for budget', () => {
      const result = parseOnboardingAnswer(1, 'budget-conscious');
      expect(result.qualityPreferences?.[0]?.priceWeight).toBe(0.8);
    });

    it('generates quality preferences with high brandWeight for premium', () => {
      const result = parseOnboardingAnswer(1, 'premium');
      expect(result.qualityPreferences?.[0]?.brandWeight).toBe(0.8);
    });
  });

  describe('Q2: brands', () => {
    it('parses single brand', () => {
      const result = parseOnboardingAnswer(2, 'Amul');
      expect(result.brandLoyalty).toHaveLength(1);
      expect(result.brandLoyalty?.[0]?.brand).toBe('Amul');
    });

    it('parses brand with category', () => {
      const result = parseOnboardingAnswer(2, 'Amul for dairy');
      expect(result.brandLoyalty?.[0]?.brand).toBe('Amul');
      expect(result.brandLoyalty?.[0]?.category).toBe('dairy');
    });

    it('parses multiple brands', () => {
      const result = parseOnboardingAnswer(2, 'Amul, Tata, Haldirams');
      expect(result.brandLoyalty).toHaveLength(3);
    });

    it('returns empty array for "none"', () => {
      const result = parseOnboardingAnswer(2, 'no, not really');
      expect(result.brandLoyalty).toEqual([]);
    });

    it('assigns default score of 70', () => {
      const result = parseOnboardingAnswer(2, 'Amul');
      expect(result.brandLoyalty?.[0]?.score).toBe(70);
    });
  });

  describe('Q3: categories', () => {
    it('parses known categories', () => {
      const result = parseOnboardingAnswer(3, 'dairy, snacks, beverages');
      expect(result.preferredCategories).toContain('dairy');
      expect(result.preferredCategories).toContain('snacks');
      expect(result.preferredCategories).toContain('beverages');
    });

    it('parses custom categories from comma-separated input', () => {
      const result = parseOnboardingAnswer(3, 'pasta, cereal, juice');
      expect(result.preferredCategories).toContain('pasta');
      expect(result.preferredCategories).toContain('cereal');
      expect(result.preferredCategories).toContain('juice');
    });
  });

  describe('Q4: substitutions', () => {
    it('parses strict', () => {
      const result = parseOnboardingAnswer(4, 'strict, I want the same brand');
      expect(result.qualityPreferences?.[0]?.toleranceLevel).toBe('strict');
    });

    it('parses flexible', () => {
      const result = parseOnboardingAnswer(4, "I'm flexible, open to anything");
      expect(result.qualityPreferences?.[0]?.toleranceLevel).toBe('flexible');
    });

    it('defaults to moderate', () => {
      const result = parseOnboardingAnswer(4, 'depends on the situation');
      expect(result.qualityPreferences?.[0]?.toleranceLevel).toBe('moderate');
    });

    it('sets high brandWeight for strict tolerance', () => {
      const result = parseOnboardingAnswer(4, 'strict');
      expect(result.qualityPreferences?.[0]?.brandWeight).toBe(0.9);
    });

    it('sets low brandWeight for flexible tolerance', () => {
      const result = parseOnboardingAnswer(4, 'flexible');
      expect(result.qualityPreferences?.[0]?.brandWeight).toBe(0.3);
    });
  });

  it('returns empty object for unknown question index', () => {
    const result = parseOnboardingAnswer(99, 'anything');
    expect(result).toEqual({});
  });
});

// ─── generateOnboardingResponse ──────────────────────────────────────────────

describe('generateOnboardingResponse', () => {
  it('returns welcome message with first question on initial turn', () => {
    const state = createOnboardingState();
    const response = generateOnboardingResponse(state);
    expect(response.content).toContain('Welcome');
    expect(response.content).toContain('dietary');
  });

  it('returns next question after receiving an answer', () => {
    const state: OnboardingState = {
      questionsAsked: 2,
      questionsTotal: 5,
      answers: { dietary: 'vegan', budget: 'moderate' },
      complete: false,
    };
    const response = generateOnboardingResponse(state, 'moderate');
    expect(response.content).toContain('Got it!');
    expect(response.content).toContain('brand');
  });

  it('returns completion message when onboarding is complete', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {},
      complete: true,
    };
    const response = generateOnboardingResponse(state, 'flexible');
    expect(response.content).toContain('Thanks');
    expect(response.content).toContain('ready to help');
  });

  it('returns completion when questions asked equals total', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {},
      complete: false,
    };
    const response = generateOnboardingResponse(state, 'last answer');
    expect(response.content).toContain('Thanks');
  });
});

// ─── createOnboardingState ───────────────────────────────────────────────────

describe('createOnboardingState', () => {
  it('creates state with 0 questions asked', () => {
    const state = createOnboardingState();
    expect(state.questionsAsked).toBe(0);
  });

  it('sets total questions to match ONBOARDING_QUESTIONS length', () => {
    const state = createOnboardingState();
    expect(state.questionsTotal).toBe(ONBOARDING_QUESTIONS.length);
    expect(state.questionsTotal).toBe(5);
  });

  it('starts with empty answers', () => {
    const state = createOnboardingState();
    expect(state.answers).toEqual({});
  });

  it('starts not complete', () => {
    const state = createOnboardingState();
    expect(state.complete).toBe(false);
  });
});

// ─── advanceOnboardingState ──────────────────────────────────────────────────

describe('advanceOnboardingState', () => {
  it('increments questionsAsked', () => {
    const state = createOnboardingState();
    const next = advanceOnboardingState(state, 'vegetarian');
    expect(next.questionsAsked).toBe(1);
  });

  it('records the answer with the correct key', () => {
    const state = createOnboardingState();
    const next = advanceOnboardingState(state, 'vegetarian');
    expect(next.answers['dietary']).toBe('vegetarian');
  });

  it('marks complete when all questions answered', () => {
    let state = createOnboardingState();
    state = advanceOnboardingState(state, 'vegan');
    state = advanceOnboardingState(state, 'budget');
    state = advanceOnboardingState(state, 'Amul');
    state = advanceOnboardingState(state, 'dairy, snacks');
    state = advanceOnboardingState(state, 'flexible');
    expect(state.complete).toBe(true);
    expect(state.questionsAsked).toBe(5);
  });

  it('does not mutate the original state', () => {
    const state = createOnboardingState();
    const next = advanceOnboardingState(state, 'test');
    expect(state.questionsAsked).toBe(0);
    expect(next.questionsAsked).toBe(1);
  });
});

// ─── collectOnboardingPreferences ────────────────────────────────────────────

describe('collectOnboardingPreferences', () => {
  it('aggregates dietary flags from answers', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {
        dietary: 'I am vegan and gluten-free',
        budget: 'moderate',
        brands: 'Amul for dairy',
        categories: 'dairy, snacks',
        substitutions: 'flexible',
      },
      complete: true,
    };

    const prefs = collectOnboardingPreferences(state);
    expect(prefs.dietaryFlags).toContain('vegan');
    expect(prefs.dietaryFlags).toContain('gluten-free');
  });

  it('aggregates brand loyalty from answers', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {
        dietary: 'none',
        budget: 'moderate',
        brands: 'Amul for dairy, Tata for beverages',
        categories: 'dairy',
        substitutions: 'moderate',
      },
      complete: true,
    };

    const prefs = collectOnboardingPreferences(state);
    expect(prefs.brandLoyalty).toBeDefined();
    expect(prefs.brandLoyalty!.length).toBeGreaterThanOrEqual(2);
  });

  it('aggregates quality preferences from budget and substitution answers', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {
        dietary: 'vegetarian',
        budget: 'premium',
        brands: 'none',
        categories: 'dairy',
        substitutions: 'strict',
      },
      complete: true,
    };

    const prefs = collectOnboardingPreferences(state);
    expect(prefs.qualityPreferences).toBeDefined();
    expect(prefs.qualityPreferences!.length).toBeGreaterThanOrEqual(2);
  });

  it('sets budget level', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {
        dietary: 'none',
        budget: 'budget-conscious',
        brands: 'none',
        categories: 'snacks',
        substitutions: 'flexible',
      },
      complete: true,
    };

    const prefs = collectOnboardingPreferences(state);
    expect(prefs.budgetLevel).toBe('budget-conscious');
  });

  it('collects preferred categories', () => {
    const state: OnboardingState = {
      questionsAsked: 5,
      questionsTotal: 5,
      answers: {
        dietary: 'none',
        budget: 'moderate',
        brands: 'none',
        categories: 'dairy, snacks, beverages',
        substitutions: 'moderate',
      },
      complete: true,
    };

    const prefs = collectOnboardingPreferences(state);
    expect(prefs.preferredCategories).toContain('dairy');
    expect(prefs.preferredCategories).toContain('snacks');
    expect(prefs.preferredCategories).toContain('beverages');
  });
});

// ─── Onboarding Flow Integration ─────────────────────────────────────────────

describe('onboarding flow integration', () => {
  it('completes full onboarding flow with 5 questions asked', () => {
    let state = createOnboardingState();

    // Turn 1: get first question
    const firstResponse = generateOnboardingResponse(state);
    expect(firstResponse.content).toContain('dietary');

    // Answer Q1
    state = advanceOnboardingState(state, 'vegetarian');
    const r2 = generateOnboardingResponse(state, 'vegetarian');
    expect(r2.content).toContain('budget');

    // Answer Q2
    state = advanceOnboardingState(state, 'moderate');
    const r3 = generateOnboardingResponse(state, 'moderate');
    expect(r3.content).toContain('brand');

    // Answer Q3
    state = advanceOnboardingState(state, 'Amul for dairy');
    const r4 = generateOnboardingResponse(state, 'Amul for dairy');
    expect(r4.content).toContain('categor');

    // Answer Q4
    state = advanceOnboardingState(state, 'dairy, snacks');
    const r5 = generateOnboardingResponse(state, 'dairy, snacks');
    expect(r5.content).toContain('substitut');

    // Answer Q5
    state = advanceOnboardingState(state, 'flexible');
    expect(state.complete).toBe(true);

    const finalResponse = generateOnboardingResponse(state, 'flexible');
    expect(finalResponse.content).toContain('Thanks');

    // Verify collected preferences
    const prefs = collectOnboardingPreferences(state);
    expect(prefs.dietaryFlags).toContain('vegetarian');
    expect(prefs.brandLoyalty!.length).toBeGreaterThan(0);
    expect(prefs.qualityPreferences!.length).toBeGreaterThan(0);
    expect(prefs.preferredCategories).toContain('dairy');
  });

  it('onboarding questions count is between 3 and 5', () => {
    const state = createOnboardingState();
    expect(state.questionsTotal).toBeGreaterThanOrEqual(3);
    expect(state.questionsTotal).toBeLessThanOrEqual(5);
  });
});
