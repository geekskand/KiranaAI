/**
 * Orchestration Handler for KiranaAI.
 *
 * Full orchestration pipeline that connects the agent, all engines,
 * session store, and preference graph through the ProviderRegistry.
 *
 * Flow:
 * 1. Receive user message (from WebSocket handler or Express route)
 * 2. Load session context from SessionStore (via registry)
 * 3. Check if user is cold-start (no preference graph data) → trigger onboarding
 * 4. Invoke agent (Bedrock or rule-based fallback via registry) with:
 *    - Session context
 *    - User message
 *    - Available tools (lookup_preference, search_products, check_quality_tolerance, update_cart)
 * 5. Process agent response:
 *    - If agent used tools, dispatch to appropriate engine
 *    - Route confidence-based actions (auto-add, suggest, shortlist)
 * 6. After cart update: check if basket completion should trigger
 *    (cart has items, < 2 suggestions given)
 * 7. After cart update: check if gap-fill should trigger
 *    (cart total < free delivery threshold, 0 gap-fill suggestions given)
 * 8. Enforce dietary restrictions: filter all product recommendations against
 *    user's dietary flags before returning
 * 9. Save updated session context
 * 10. Return response (with products, cart updates, etc.)
 *
 * Requirements: 1.2, 4.1, 5.1, 6.1, 7.1, 8.2
 */

import type {
  SessionContext,
  AgentContext,
  AgentResponse,
  Message,
  ProductCard,
  ProductSuggestion,
  Product,
  DietaryFlag,
} from '../models/index.js';
import type {
  SessionStoreProvider,
  PreferenceStoreProvider,
  AgentProvider,
} from '../providers/interfaces.js';
import { ProviderRegistry, getRegistry } from '../providers/registry.js';
import { getConfig } from '../config/index.js';
import {
  isColdStartUser,
  createOnboardingState,
  advanceOnboardingState,
  generateOnboardingResponse,
  collectOnboardingPreferences,
} from '../agent/onboarding.js';
import { dispatchTool, type ToolContext } from '../agent/tools.js';
import { getBasketCompletions } from '../engines/basket-completion.js';
import { getGapFillSuggestion } from '../engines/gap-fill.js';
import { catalog as seedCatalog } from '../seed/catalog.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Dependencies injected into the orchestrator (for testing or manual override) */
export interface OrchestratorDeps {
  sessionStore: SessionStoreProvider;
  preferenceStore: PreferenceStoreProvider;
  agentProvider: AgentProvider;
  /** Product catalog for basket completion and gap-fill */
  catalog: Product[];
  /** Free delivery threshold override (defaults to config value) */
  freeDeliveryThreshold?: number;
}

/** Input to the orchestrator handler */
export interface OrchestratorInput {
  sessionId: string;
  userId: string;
  message: string;
}

/** Output from the orchestrator handler */
export interface OrchestratorOutput {
  response: AgentResponse;
  sessionId: string;
  /** Basket completion suggestions triggered after the response */
  basketSuggestions?: ProductSuggestion[];
  /** Gap-fill suggestion triggered after the response */
  gapFillSuggestion?: ProductSuggestion | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum cart items required before triggering basket completion */
const BASKET_COMPLETION_MIN_CART_ITEMS = 1;

/** Maximum basket completion suggestions before stopping */
const MAX_BASKET_SUGGESTIONS = 2;

// ─── Dietary Restriction Enforcement ─────────────────────────────────────────

/**
 * Map of dietary flags to product label exclusion patterns.
 * Products with these labels are excluded for users with the corresponding flag.
 */
const DIETARY_EXCLUSION_MAP: Record<DietaryFlag, (product: Product) => boolean> = {
  vegetarian: (p) =>
    p.labels.some((l) =>
      ['non-veg', 'non-vegetarian', 'meat', 'chicken', 'fish', 'seafood', 'egg'].includes(
        l.toLowerCase()
      )
    ),
  vegan: (p) =>
    p.labels.some((l) =>
      [
        'non-veg', 'non-vegetarian', 'meat', 'chicken', 'fish', 'seafood',
        'egg', 'dairy', 'milk', 'cheese', 'butter', 'ghee', 'paneer', 'curd',
      ].includes(l.toLowerCase())
    ) || p.category.toLowerCase() === 'dairy',
  'gluten-free': (p) =>
    p.labels.some((l) =>
      ['gluten', 'wheat', 'contains-gluten'].includes(l.toLowerCase())
    ),
  'dairy-free': (p) =>
    p.labels.some((l) =>
      ['dairy', 'milk', 'cheese', 'butter', 'ghee', 'paneer', 'curd'].includes(
        l.toLowerCase()
      )
    ) || p.category.toLowerCase() === 'dairy',
  'low-sugar': (p) =>
    p.labels.some((l) =>
      ['high-sugar', 'sugar-heavy', 'sweetened'].includes(l.toLowerCase())
    ),
  'organic-only': (p) =>
    !p.labels.some((l) => l.toLowerCase() === 'organic'),
};

/**
 * Filter products based on user's dietary restrictions.
 * Removes any product that violates any of the user's dietary flags.
 */
export function filterByDietaryRestrictions(
  products: Product[],
  dietaryFlags: DietaryFlag[]
): Product[] {
  if (!dietaryFlags || dietaryFlags.length === 0) return products;

  return products.filter((product) => {
    for (const flag of dietaryFlags) {
      const isExcluded = DIETARY_EXCLUSION_MAP[flag];
      if (isExcluded && isExcluded(product)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Filter product cards based on dietary restrictions.
 * Looks up each product card in the catalog and applies dietary filtering.
 */
export function filterCardsByDietaryRestrictions(
  cards: ProductCard[],
  dietaryFlags: DietaryFlag[],
  catalog: Product[]
): ProductCard[] {
  if (!dietaryFlags || dietaryFlags.length === 0) return cards;

  return cards.filter((card) => {
    const product = catalog.find((p) => p.productId === card.productId);
    if (!product) return true; // If not in catalog, let it through

    for (const flag of dietaryFlags) {
      const isExcluded = DIETARY_EXCLUSION_MAP[flag];
      if (isExcluded && isExcluded(product)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Filter product suggestions based on dietary restrictions.
 */
export function filterSuggestionsByDietaryRestrictions(
  suggestions: ProductSuggestion[],
  dietaryFlags: DietaryFlag[]
): ProductSuggestion[] {
  if (!dietaryFlags || dietaryFlags.length === 0) return suggestions;

  return suggestions.filter((suggestion) => {
    for (const flag of dietaryFlags) {
      const isExcluded = DIETARY_EXCLUSION_MAP[flag];
      if (isExcluded && isExcluded(suggestion.product)) {
        return false;
      }
    }
    return true;
  });
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Creates a new empty session for a user.
 */
export function createNewSession(sessionId: string, userId: string): SessionContext {
  return {
    sessionId,
    userId,
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: {
      basketCompletion: 0,
      gapFill: 0,
    },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

/**
 * Builds AgentContext from a SessionContext for agent invocation.
 */
function buildAgentContext(session: SessionContext): AgentContext {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    conversationHistory: session.conversationHistory,
    cartState: session.cartState,
  };
}

/**
 * Calculate the total cart value.
 */
function calculateCartTotal(session: SessionContext): number {
  return session.cartState.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
}

// ─── Registry-Based Orchestration (Main Entry Point) ─────────────────────────

/**
 * Main orchestration handler using the ProviderRegistry.
 *
 * This is the primary entry point callable from both the Lambda handler
 * and the Express route handler. It resolves all providers from the registry
 * and executes the full pipeline.
 *
 * @param input - The user message input (sessionId, userId, message)
 * @param registry - Optional registry override (defaults to global singleton)
 * @returns OrchestratorOutput with agent response and optional suggestions
 */
export async function orchestrate(
  input: OrchestratorInput,
  registry?: ProviderRegistry
): Promise<OrchestratorOutput> {
  const reg = registry ?? getRegistry();
  const config = getConfig();

  // Resolve providers from registry
  const sessionStore = await reg.sessionStore;
  const preferenceStore = await reg.preferenceStore;
  const agentProvider = await reg.agent;

  // Use seed catalog as the product catalog
  const catalog: Product[] = seedCatalog;

  const deps: OrchestratorDeps = {
    sessionStore,
    preferenceStore,
    agentProvider,
    catalog,
    freeDeliveryThreshold: config.freeDeliveryThreshold,
  };

  return handleMessage(input, deps);
}

// ─── Main Orchestration Handler ──────────────────────────────────────────────

/**
 * Main orchestration handler that processes user messages.
 * Can be called directly with explicit deps (useful for testing)
 * or via `orchestrate()` which resolves deps from the registry.
 *
 * @param input - The user message input (sessionId, userId, message)
 * @param deps - Injected provider dependencies
 * @returns OrchestratorOutput with agent response and optional suggestions
 */
export async function handleMessage(
  input: OrchestratorInput,
  deps: OrchestratorDeps
): Promise<OrchestratorOutput> {
  const { sessionId, userId, message } = input;
  const { sessionStore, preferenceStore, agentProvider, catalog } = deps;
  const freeDeliveryThreshold = deps.freeDeliveryThreshold ?? getConfig().freeDeliveryThreshold;

  // 1. Load session context from SessionStore (or create new)
  let session = await sessionStore.getSession(sessionId);
  if (!session) {
    session = createNewSession(sessionId, userId);
  }

  // Update activity timestamp
  session.lastActivityAt = Date.now();

  // 2. Load user profile for dietary restriction enforcement
  const userProfile = await preferenceStore.getUserProfile(userId);
  const dietaryFlags: DietaryFlag[] = userProfile?.dietaryFlags ?? [];

  // 3. Check if user is cold-start → trigger onboarding
  const isColdStart = isColdStartUser(userProfile);

  if (isColdStart && !session.onboardingState?.complete) {
    const onboardingResult = await handleOnboarding(session, message, deps);
    return onboardingResult;
  }

  // 4. Invoke agent with context + message
  const agentContext = buildAgentContext(session);
  let agentResponse = await agentProvider.invoke(agentContext, message);

  // Record the user message in conversation history
  const userMessage: Message = {
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };
  session.conversationHistory.push(userMessage);

  // 5. Process agent response — dispatch tool calls if present
  if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
    // Resolve cache provider for tool dispatch (gap-fill, etc.)
    const cacheProvider = await getRegistry().cache;
    const toolContext: ToolContext = {
      preferenceStore,
      sessionStore,
      cache: cacheProvider,
      catalog,
    };

    for (const toolCall of agentResponse.toolCalls) {
      const result = await dispatchTool(
        toolCall.tool,
        toolCall.input,
        toolContext
      );
      toolCall.output = result.data as Record<string, unknown>;

      // Record in reasoning history
      session.agentReasoningHistory.push({
        tool: toolCall.tool,
        input: toolCall.input,
        output: toolCall.output,
        timestamp: Date.now(),
      });
    }

    // Re-read session state in case update_cart modified it
    const updatedSession = await sessionStore.getSession(sessionId);
    if (updatedSession) {
      session.cartState = updatedSession.cartState;
    }
  }

  // 8. Enforce dietary restrictions on product recommendations in agent response
  if (agentResponse.products && agentResponse.products.length > 0) {
    agentResponse = {
      ...agentResponse,
      products: filterCardsByDietaryRestrictions(
        agentResponse.products,
        dietaryFlags,
        catalog
      ),
    };
  }

  // Record assistant message in conversation history
  const assistantMessage: Message = {
    role: 'assistant',
    content: agentResponse.content,
    products: agentResponse.products,
    timestamp: Date.now(),
  };
  session.conversationHistory.push(assistantMessage);

  // 6 & 7. After cart update: check basket completion and gap-fill triggers
  let basketSuggestions: ProductSuggestion[] | undefined;
  let gapFillSuggestion: ProductSuggestion | null | undefined;

  if (session.cartState.length >= BASKET_COMPLETION_MIN_CART_ITEMS) {
    // 6. Basket completion trigger
    // Only trigger if fewer than MAX_BASKET_SUGGESTIONS have been given
    if (session.suggestionsGiven.basketCompletion < MAX_BASKET_SUGGESTIONS) {
      const basketResult = getBasketCompletions(session.cartState, session, catalog);
      if (basketResult.suggestions.length > 0) {
        // Filter basket suggestions by dietary restrictions
        const filteredBasketSuggestions = filterSuggestionsByDietaryRestrictions(
          basketResult.suggestions,
          dietaryFlags
        );

        if (filteredBasketSuggestions.length > 0) {
          basketSuggestions = filteredBasketSuggestions;
          session.suggestionsGiven.basketCompletion += filteredBasketSuggestions.length;
        }
      }
    }

    // 7. Gap-fill trigger
    // Only trigger if 0 gap-fill suggestions have been given and cart total < threshold
    const cartTotal = calculateCartTotal(session);
    if (
      session.suggestionsGiven.gapFill === 0 &&
      cartTotal < freeDeliveryThreshold
    ) {
      const gapFillResult = getGapFillSuggestion(
        session.cartState,
        session,
        catalog,
        freeDeliveryThreshold
      );

      if (gapFillResult.suggestion) {
        // Filter gap-fill suggestion by dietary restrictions
        const filteredGapFill = filterSuggestionsByDietaryRestrictions(
          [gapFillResult.suggestion],
          dietaryFlags
        );

        if (filteredGapFill.length > 0) {
          gapFillSuggestion = filteredGapFill[0];
          session.suggestionsGiven.gapFill += 1;
        } else {
          gapFillSuggestion = null;
        }
      }
    }
  }

  // 9. Save updated session context
  await sessionStore.saveSession(sessionId, session);

  // 10. Return response
  return {
    response: agentResponse,
    sessionId,
    basketSuggestions,
    gapFillSuggestion,
  };
}

// ─── Onboarding Sub-Handler ──────────────────────────────────────────────────

/**
 * Handles the onboarding flow for cold-start users.
 *
 * If no onboarding state exists, initializes it and returns the first question.
 * Otherwise, advances the state and returns the next question or completion.
 */
async function handleOnboarding(
  session: SessionContext,
  message: string,
  deps: OrchestratorDeps
): Promise<OrchestratorOutput> {
  const { sessionStore, preferenceStore } = deps;

  // Initialize onboarding state if not already set
  if (!session.onboardingState) {
    session.onboardingState = createOnboardingState();

    // First interaction — return welcome + first question
    const response = generateOnboardingResponse(session.onboardingState);

    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
    };
    session.conversationHistory.push(assistantMessage);

    await sessionStore.saveSession(session.sessionId, session);

    return {
      response,
      sessionId: session.sessionId,
    };
  }

  // Record user's answer
  const userMessage: Message = {
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };
  session.conversationHistory.push(userMessage);

  // Advance onboarding state
  session.onboardingState = advanceOnboardingState(session.onboardingState, message);

  // Generate response (next question or completion message)
  const response = generateOnboardingResponse(session.onboardingState, message);

  const assistantMessage: Message = {
    role: 'assistant',
    content: response.content,
    timestamp: Date.now(),
  };
  session.conversationHistory.push(assistantMessage);

  // If onboarding is now complete, persist preferences to the Preference Graph
  if (session.onboardingState.complete) {
    const preferences = collectOnboardingPreferences(session.onboardingState);

    // Set dietary flags
    if (preferences.dietaryFlags) {
      for (const flag of preferences.dietaryFlags) {
        await preferenceStore.setDietaryFlag(session.userId, flag);
      }
    }

    // Set brand loyalty entries
    if (preferences.brandLoyalty) {
      for (const entry of preferences.brandLoyalty) {
        await preferenceStore.updateBrandLoyalty(
          session.userId,
          entry.category,
          entry.brand,
          entry.score
        );
      }
    }
  }

  // Persist updated session
  await sessionStore.saveSession(session.sessionId, session);

  return {
    response,
    sessionId: session.sessionId,
  };
}
