/**
 * Core data models and shared types for KiranaAI backend.
 * Requirements: 2.1, 8.1, 9.1
 */

// ─── Dietary & Preference Types ─────────────────────────────────────────────

export type DietaryFlag =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'low-sugar'
  | 'organic-only';

export interface BrandLoyaltyEntry {
  category: string;
  brand: string;
  /** Loyalty score from 0-100 */
  score: number;
  lastUpdated: number;
}

export interface QualityPreference {
  category: string;
  toleranceLevel: 'strict' | 'moderate' | 'flexible';
  /** Weight for price factor, 0-1 */
  priceWeight: number;
  /** Weight for brand factor, 0-1 */
  brandWeight: number;
}

// ─── User Profile ────────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  dietaryFlags: DietaryFlag[];
  brandLoyalty: BrandLoyaltyEntry[];
  qualityPreferences: QualityPreference[];
  createdAt: number;
  updatedAt: number;
}

export interface CategoryPreferences {
  category: string;
  toleranceLevel: 'strict' | 'moderate' | 'flexible';
  priceWeight: number;
  brandWeight: number;
  preferredBrands: string[];
}

// ─── Product ─────────────────────────────────────────────────────────────────

export interface Product {
  productId: string;
  name: string;
  price: number;
  category: string;
  brand: string;
  labels: string[];
  imageUrl?: string;
}

// ─── Cart ────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

// ─── Confidence Scoring ──────────────────────────────────────────────────────

export interface ConfidenceFactor {
  name: string;
  weight: number;
  contribution: number;
}

export interface ConfidenceScore {
  /** Confidence value from 0-1 */
  value: number;
  band: 'high' | 'medium' | 'low';
  factors: ConfidenceFactor[];
}

export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  medium: 0.55,
} as const;

// ─── Quality Tolerance ───────────────────────────────────────────────────────

export interface QualityToleranceResult {
  score: number;
  acceptable: boolean;
  reasons: string[];
  factors: {
    brandMatch: number;
    categoryMatch: number;
    priceDeviation: number;
    dietaryCompliance: number;
    qualityLevel: number;
  };
}

export const ACCEPTANCE_THRESHOLD = 0.6;

// ─── Agent Types ─────────────────────────────────────────────────────────────

export interface AgentContext {
  sessionId: string;
  userId: string;
  conversationHistory: Message[];
  cartState: CartItem[];
}

export interface AgentResponse {
  content: string;
  products?: ProductCard[];
  action?: 'auto-added' | 'suggest' | 'shortlist';
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }>;
}

export interface ProductSuggestion {
  product: Product;
  reason: string;
  confidence: number;
}

// ─── Session Context ─────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  products?: ProductCard[];
  timestamp: number;
}

export interface ProductCard {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  /** Reason for suggestion (basket completion / gap-fill) */
  reason?: string;
}

export interface OnboardingState {
  questionsAsked: number;
  questionsTotal: number;
  answers: Record<string, string>;
  complete: boolean;
}

export interface ReasoningStep {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: number;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  conversationHistory: Message[];
  cartState: CartItem[];
  agentReasoningHistory: ReasoningStep[];
  onboardingState?: OnboardingState;
  suggestionsGiven: {
    basketCompletion: number;
    gapFill: number;
  };
  createdAt: number;
  lastActivityAt: number;
}
