/**
 * Onboarding flow logic for cold-start users.
 *
 * Detects users with no Preference_Graph data and generates
 * 3-5 onboarding questions (one per turn) to bootstrap the
 * Preference_Graph with initial scores, flags, and preferences.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import type {
  UserProfile,
  OnboardingState,
  AgentResponse,
  DietaryFlag,
  BrandLoyaltyEntry,
  QualityPreference,
} from '../models/index.js';

// ─── Onboarding Questions ────────────────────────────────────────────────────

export interface OnboardingQuestion {
  index: number;
  key: string;
  text: string;
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    index: 0,
    key: 'dietary',
    text: 'What dietary preferences do you have? (e.g., vegetarian, vegan, gluten-free, dairy-free, low-sugar, organic-only)',
  },
  {
    index: 1,
    key: 'budget',
    text: "What's your typical budget range for groceries? (budget-conscious, moderate, or premium)",
  },
  {
    index: 2,
    key: 'brands',
    text: 'Do you have any favorite brands? If so, which ones and for what categories?',
  },
  {
    index: 3,
    key: 'categories',
    text: 'What grocery categories do you shop most often? (e.g., dairy, snacks, beverages, fruits, grains)',
  },
  {
    index: 4,
    key: 'substitutions',
    text: 'How strict are you about substitutions when your preferred product is unavailable? (strict, moderate, or flexible)',
  },
];

// ─── Parsed Data Types ───────────────────────────────────────────────────────

export interface OnboardingParsedData {
  dietaryFlags?: DietaryFlag[];
  brandLoyalty?: BrandLoyaltyEntry[];
  qualityPreferences?: QualityPreference[];
  budgetLevel?: 'budget-conscious' | 'moderate' | 'premium';
  preferredCategories?: string[];
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Detects whether a user is a cold-start user with no meaningful
 * Preference_Graph data.
 *
 * Returns true if profile is null or has no dietary flags,
 * brand loyalty entries, or quality preferences.
 */
export function isColdStartUser(userProfile: UserProfile | null): boolean {
  if (!userProfile) return true;

  const hasDietaryFlags = userProfile.dietaryFlags.length > 0;
  const hasBrandLoyalty = userProfile.brandLoyalty.length > 0;
  const hasQualityPrefs = userProfile.qualityPreferences.length > 0;

  return !hasDietaryFlags && !hasBrandLoyalty && !hasQualityPrefs;
}

/**
 * Returns the next onboarding question text, or null if the
 * onboarding flow is complete.
 */
export function getNextOnboardingQuestion(state: OnboardingState): string | null {
  if (state.complete) return null;
  if (state.questionsAsked >= state.questionsTotal) return null;

  const question = ONBOARDING_QUESTIONS[state.questionsAsked];
  return question ? question.text : null;
}

/**
 * Parses a free-text answer for a given question index into
 * structured preference data.
 */
export function parseOnboardingAnswer(
  questionIndex: number,
  answer: string
): OnboardingParsedData {
  const trimmedAnswer = answer.trim();
  const normalizedAnswer = trimmedAnswer.toLowerCase();

  switch (questionIndex) {
    case 0:
      return parseDietaryAnswer(normalizedAnswer);
    case 1:
      return parseBudgetAnswer(normalizedAnswer);
    case 2:
      // Brands need original casing preserved
      return parseBrandsAnswer(trimmedAnswer);
    case 3:
      return parseCategoriesAnswer(normalizedAnswer);
    case 4:
      return parseSubstitutionsAnswer(normalizedAnswer);
    default:
      return {};
  }
}

/**
 * Generates the agent response for an onboarding turn.
 *
 * If no answer is provided (first turn), returns the first question.
 * Otherwise, processes the answer and returns the next question
 * or a completion message.
 */
export function generateOnboardingResponse(
  state: OnboardingState,
  answer?: string
): AgentResponse {
  // If answer provided, this is a follow-up turn
  if (answer !== undefined) {
    // Check if onboarding is now complete
    if (state.complete || state.questionsAsked >= state.questionsTotal) {
      return {
        content:
          "Thanks for sharing your preferences! I've set up your profile and I'm ready to help you find the perfect groceries. What can I help you with today?",
      };
    }

    // Get next question
    const nextQuestion = getNextOnboardingQuestion(state);
    if (!nextQuestion) {
      return {
        content:
          "Thanks for sharing your preferences! I've set up your profile and I'm ready to help you find the perfect groceries. What can I help you with today?",
      };
    }

    return {
      content: `Got it! ${nextQuestion}`,
    };
  }

  // First turn — ask the first question
  const firstQuestion = getNextOnboardingQuestion(state);
  if (!firstQuestion) {
    return {
      content: "Welcome! Let's get you started. What can I help you with today?",
    };
  }

  return {
    content: `Welcome to KiranaAI! I'd like to learn a bit about your preferences so I can give you better recommendations. ${firstQuestion}`,
  };
}

/**
 * Creates an initial OnboardingState for a new cold-start user.
 */
export function createOnboardingState(): OnboardingState {
  return {
    questionsAsked: 0,
    questionsTotal: ONBOARDING_QUESTIONS.length,
    answers: {},
    complete: false,
  };
}

/**
 * Advances the onboarding state by recording the answer and
 * incrementing the questions asked counter.
 */
export function advanceOnboardingState(
  state: OnboardingState,
  answer: string
): OnboardingState {
  const questionKey = ONBOARDING_QUESTIONS[state.questionsAsked]?.key ?? `q${state.questionsAsked}`;
  const newQuestionsAsked = state.questionsAsked + 1;
  const isComplete = newQuestionsAsked >= state.questionsTotal;

  return {
    questionsAsked: newQuestionsAsked,
    questionsTotal: state.questionsTotal,
    answers: { ...state.answers, [questionKey]: answer },
    complete: isComplete,
  };
}

/**
 * Collects all parsed preference data from a completed onboarding state.
 * Returns aggregate preferences suitable for populating the Preference_Graph.
 */
export function collectOnboardingPreferences(state: OnboardingState): OnboardingParsedData {
  const result: OnboardingParsedData = {
    dietaryFlags: [],
    brandLoyalty: [],
    qualityPreferences: [],
    preferredCategories: [],
  };

  for (const [key, answer] of Object.entries(state.answers)) {
    const questionIndex = ONBOARDING_QUESTIONS.findIndex((q) => q.key === key);
    if (questionIndex === -1) continue;

    const parsed = parseOnboardingAnswer(questionIndex, answer);

    if (parsed.dietaryFlags) {
      result.dietaryFlags = [...(result.dietaryFlags ?? []), ...parsed.dietaryFlags];
    }
    if (parsed.brandLoyalty) {
      result.brandLoyalty = [...(result.brandLoyalty ?? []), ...parsed.brandLoyalty];
    }
    if (parsed.qualityPreferences) {
      result.qualityPreferences = [
        ...(result.qualityPreferences ?? []),
        ...parsed.qualityPreferences,
      ];
    }
    if (parsed.budgetLevel) {
      result.budgetLevel = parsed.budgetLevel;
    }
    if (parsed.preferredCategories) {
      result.preferredCategories = [
        ...(result.preferredCategories ?? []),
        ...parsed.preferredCategories,
      ];
    }
  }

  return result;
}

// ─── Internal Parsers ────────────────────────────────────────────────────────

const VALID_DIETARY_FLAGS: DietaryFlag[] = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'low-sugar',
  'organic-only',
];

function parseDietaryAnswer(answer: string): OnboardingParsedData {
  const flags: DietaryFlag[] = [];

  for (const flag of VALID_DIETARY_FLAGS) {
    // Match the flag even without hyphens
    const normalizedFlag = flag.replace(/-/g, '[ -]?');
    const regex = new RegExp(normalizedFlag, 'i');
    if (regex.test(answer)) {
      flags.push(flag);
    }
  }

  // Handle common aliases
  if (/\bno\s*gluten\b/i.test(answer)) flags.push('gluten-free');
  if (/\bno\s*dairy\b/i.test(answer)) flags.push('dairy-free');
  if (/\bplant[- ]?based\b/i.test(answer) && !flags.includes('vegan')) flags.push('vegan');
  if (/\borganic\b/i.test(answer) && !flags.includes('organic-only')) flags.push('organic-only');

  // Deduplicate
  const uniqueFlags = [...new Set(flags)];

  return { dietaryFlags: uniqueFlags.length > 0 ? uniqueFlags : undefined };
}

function parseBudgetAnswer(answer: string): OnboardingParsedData {
  let budgetLevel: OnboardingParsedData['budgetLevel'];

  if (/\b(budget|cheap|affordable|value|low|save|economical)\b/i.test(answer)) {
    budgetLevel = 'budget-conscious';
  } else if (/\b(premium|expensive|high[- ]?end|luxury|top|quality)\b/i.test(answer)) {
    budgetLevel = 'premium';
  } else {
    budgetLevel = 'moderate';
  }

  // Generate quality preferences based on budget
  const priceWeight = budgetLevel === 'budget-conscious' ? 0.8 : budgetLevel === 'premium' ? 0.2 : 0.5;
  const brandWeight = budgetLevel === 'premium' ? 0.8 : budgetLevel === 'budget-conscious' ? 0.3 : 0.5;

  const qualityPreferences: QualityPreference[] = [
    {
      category: 'general',
      toleranceLevel: 'moderate',
      priceWeight,
      brandWeight,
    },
  ];

  return { budgetLevel, qualityPreferences };
}

function parseBrandsAnswer(answer: string): OnboardingParsedData {
  const brandLoyalty: BrandLoyaltyEntry[] = [];

  if (/\b(no|none|not really|don'?t have|nope)\b/i.test(answer.toLowerCase())) {
    return { brandLoyalty: [] };
  }

  // Extract brand mentions — split by common delimiters
  const parts = answer.split(/[,;&\/]+/).map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    // Try to detect "brand for category" or "brand (category)" patterns
    const forMatch = part.match(/(.+?)\s+(?:for|in)\s+(.+)/i);
    const parenMatch = part.match(/(.+?)\s*\((.+?)\)/i);

    if (forMatch) {
      brandLoyalty.push({
        brand: forMatch[1].trim(),
        category: forMatch[2].trim(),
        score: 70,
        lastUpdated: Date.now(),
      });
    } else if (parenMatch) {
      brandLoyalty.push({
        brand: parenMatch[1].trim(),
        category: parenMatch[2].trim(),
        score: 70,
        lastUpdated: Date.now(),
      });
    } else if (part.length > 1 && part.length < 50) {
      // Standalone brand name — assign to general category
      brandLoyalty.push({
        brand: part,
        category: 'general',
        score: 70,
        lastUpdated: Date.now(),
      });
    }
  }

  return { brandLoyalty: brandLoyalty.length > 0 ? brandLoyalty : undefined };
}

function parseCategoriesAnswer(answer: string): OnboardingParsedData {
  const knownCategories = [
    'dairy',
    'snacks',
    'beverages',
    'fruits',
    'vegetables',
    'grains',
    'bakery',
    'meat',
    'seafood',
    'frozen',
    'condiments',
    'spices',
    'breakfast',
    'personal care',
    'household',
    'baby',
    'pet',
  ];

  const preferredCategories: string[] = [];

  for (const category of knownCategories) {
    if (answer.includes(category)) {
      preferredCategories.push(category);
    }
  }

  // If no known categories matched, try to extract from comma-separated list
  if (preferredCategories.length === 0) {
    const parts = answer.split(/[,;&\/]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.length > 1 && part.length < 30) {
        preferredCategories.push(part);
      }
    }
  }

  return { preferredCategories: preferredCategories.length > 0 ? preferredCategories : undefined };
}

function parseSubstitutionsAnswer(answer: string): OnboardingParsedData {
  let toleranceLevel: 'strict' | 'moderate' | 'flexible';

  if (/\b(strict|no substitut|exact|same brand|won'?t accept|never)\b/i.test(answer)) {
    toleranceLevel = 'strict';
  } else if (/\b(flexible|open|any|don'?t mind|whatever|fine with)\b/i.test(answer)) {
    toleranceLevel = 'flexible';
  } else {
    toleranceLevel = 'moderate';
  }

  const qualityPreferences: QualityPreference[] = [
    {
      category: 'general',
      toleranceLevel,
      priceWeight: toleranceLevel === 'strict' ? 0.3 : toleranceLevel === 'flexible' ? 0.7 : 0.5,
      brandWeight: toleranceLevel === 'strict' ? 0.9 : toleranceLevel === 'flexible' ? 0.3 : 0.5,
    },
  ];

  return { qualityPreferences };
}
