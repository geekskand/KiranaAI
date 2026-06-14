/**
 * Provider interfaces for KiranaAI.
 *
 * All AWS service dependencies are abstracted behind these interfaces.
 * Each interface has a primary (AWS) and fallback (local) implementation.
 */

import type {
  UserProfile,
  CategoryPreferences,
  DietaryFlag,
  SessionContext,
  AgentContext,
  AgentResponse,
  CartItem,
  ProductSuggestion,
  Product,
} from '../models/index.js';

// --- Base Provider Interface ---

/**
 * Generic provider lifecycle interface.
 * All providers implement this for health checking and instance access.
 */
export interface Provider<T> {
  /** Check if the provider is available and healthy. */
  isAvailable(): Promise<boolean>;
  /** Get the underlying provider instance. */
  getInstance(): T;
}

// --- Preference Store Provider ---

/**
 * Abstraction over user preference data storage.
 * Primary: DynamoDB single-table design.
 * Fallback: Local JSON file store.
 */
export interface PreferenceStoreProvider {
  /** Retrieve the full user profile in a single query. */
  getUserProfile(userId: string): Promise<UserProfile | null>;
  /** Update brand loyalty score for a category/brand combination. */
  updateBrandLoyalty(
    userId: string,
    category: string,
    brand: string,
    delta: number
  ): Promise<void>;
  /** Set a dietary flag on the user's profile. */
  setDietaryFlag(userId: string, flag: DietaryFlag): Promise<void>;
  /** Get preferences for a specific category. */
  getPreferences(userId: string, category: string): Promise<CategoryPreferences>;
}

// --- Session Store Provider ---

/**
 * Abstraction over session/conversation state storage.
 * Primary: ElastiCache Redis.
 * Fallback: In-memory Map.
 */
export interface SessionStoreProvider {
  /** Retrieve an active session by ID. */
  getSession(sessionId: string): Promise<SessionContext | null>;
  /** Persist session state (create or update). */
  saveSession(sessionId: string, context: SessionContext): Promise<void>;
  /** Delete a session (e.g., on expiry or logout). */
  deleteSession(sessionId: string): Promise<void>;
}

// --- Cache Provider ---

/**
 * Generic cache abstraction with TTL support.
 * Primary: ElastiCache Redis.
 * Fallback: In-memory Map with timestamp-based expiration.
 */
export interface CacheProvider {
  /** Get a cached value by key. Returns null if missing or expired. */
  get<T>(key: string): Promise<T | null>;
  /** Set a value with a TTL in seconds. */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Delete a cached entry. */
  delete(key: string): Promise<void>;
}

// --- Agent Provider ---

/**
 * Abstraction over the conversational AI agent.
 * Primary: Bedrock Claude.
 * Fallback: Rule-based response generation.
 */
export interface AgentProvider {
  /** Invoke the agent with conversation context and a user message. */
  invoke(context: AgentContext, message: string): Promise<AgentResponse>;
}

// --- Recommendation Provider ---

/**
 * Abstraction over basket completion / product recommendation.
 * Primary: AWS Personalize.
 * Fallback: Hard-coded co-occurrence rules.
 */
export interface RecommendationProvider {
  /** Get complementary product suggestions for the current cart. */
  getBasketCompletions(
    cart: CartItem[],
    userId: string
  ): Promise<ProductSuggestion[]>;
}

// --- Scoring Provider ---

/**
 * Abstraction over quality tolerance / substitution scoring.
 * Primary: SageMaker model.
 * Fallback: Rule-based scoring engine.
 */
export interface ScoringProvider {
  /** Compute how acceptable a substitute is given the user's preferences. */
  computeSubstitutionScore(
    original: Product,
    substitute: Product,
    userProfile: UserProfile
  ): Promise<number>;
}
