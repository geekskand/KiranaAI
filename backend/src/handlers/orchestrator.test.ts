/**
 * Unit tests for the orchestration handler.
 *
 * Tests the full pipeline including:
 * - Session loading/creation
 * - Cold-start onboarding detection
 * - Agent invocation
 * - Basket completion triggering
 * - Gap-fill triggering
 * - Dietary restriction enforcement
 * - Session persistence
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleMessage,
  orchestrate,
  createNewSession,
  filterByDietaryRestrictions,
  filterCardsByDietaryRestrictions,
  filterSuggestionsByDietaryRestrictions,
  type OrchestratorDeps,
  type OrchestratorInput,
} from './orchestrator.js';
import type {
  SessionContext,
  AgentContext,
  AgentResponse,
  Product,
  UserProfile,
  CategoryPreferences,
  DietaryFlag,
  ProductCard,
  ProductSuggestion,
} from '../models/index.js';
import type {
  SessionStoreProvider,
  PreferenceStoreProvider,
  AgentProvider,
} from '../providers/interfaces.js';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockSessionStore(): SessionStoreProvider & { sessions: Map<string, SessionContext> } {
  const sessions = new Map<string, SessionContext>();
  return {
    sessions,
    async getSession(sessionId: string) {
      return sessions.get(sessionId) ?? null;
    },
    async saveSession(sessionId: string, context: SessionContext) {
      sessions.set(sessionId, JSON.parse(JSON.stringify(context)));
    },
    async deleteSession(sessionId: string) {
      sessions.delete(sessionId);
    },
  };
}

function createMockPreferenceStore(
  profile: UserProfile | null = null
): PreferenceStoreProvider {
  return {
    async getUserProfile() {
      return profile;
    },
    async updateBrandLoyalty() {},
    async setDietaryFlag() {},
    async getPreferences(_userId: string, category: string): Promise<CategoryPreferences> {
      return {
        category,
        toleranceLevel: 'moderate',
        priceWeight: 0.5,
        brandWeight: 0.5,
        preferredBrands: [],
      };
    },
  };
}

function createMockAgentProvider(response?: Partial<AgentResponse>): AgentProvider {
  return {
    async invoke(_context: AgentContext, _message: string): Promise<AgentResponse> {
      return {
        content: response?.content ?? 'Here are some suggestions for you.',
        products: response?.products ?? [],
        action: response?.action,
        toolCalls: response?.toolCalls,
      };
    },
  };
}

const MOCK_CATALOG: Product[] = [
  {
    productId: 'milk-001',
    name: 'Milk',
    brand: 'Amul',
    category: 'dairy',
    price: 28,
    labels: ['toned', 'pasteurized', 'dairy'],
  },
  {
    productId: 'bread-001',
    name: 'Bread',
    brand: 'Britannia',
    category: 'bakery',
    price: 40,
    labels: ['wheat', 'vegetarian'],
  },
  {
    productId: 'butter-001',
    name: 'Butter',
    brand: 'Amul',
    category: 'dairy',
    price: 55,
    labels: ['dairy', 'vegetarian'],
  },
  {
    productId: 'jam-001',
    name: 'Jam',
    brand: 'Kissan',
    category: 'spreads',
    price: 99,
    labels: ['vegetarian', 'high-sugar'],
  },
  {
    productId: 'rice-001',
    name: 'Rice',
    brand: 'India Gate',
    category: 'grains',
    price: 180,
    labels: ['gluten-free', 'vegetarian', 'vegan'],
  },
  {
    productId: 'dal-001',
    name: 'Dal',
    brand: 'Tata',
    category: 'pulses',
    price: 120,
    labels: ['vegetarian', 'vegan', 'organic'],
  },
  {
    productId: 'chicken-001',
    name: 'Chicken Breast',
    brand: 'Licious',
    category: 'meat',
    price: 250,
    labels: ['non-veg', 'protein'],
  },
];

function createDefaultDeps(overrides?: Partial<OrchestratorDeps>): OrchestratorDeps {
  const existingProfile: UserProfile = {
    userId: 'user-1',
    dietaryFlags: [],
    brandLoyalty: [{ category: 'dairy', brand: 'Amul', score: 80, lastUpdated: Date.now() }],
    qualityPreferences: [{ category: 'general', toleranceLevel: 'moderate', priceWeight: 0.5, brandWeight: 0.5 }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    sessionStore: createMockSessionStore(),
    preferenceStore: createMockPreferenceStore(existingProfile),
    agentProvider: createMockAgentProvider(),
    catalog: MOCK_CATALOG,
    freeDeliveryThreshold: 199,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Orchestrator - handleMessage', () => {
  it('creates a new session when none exists', async () => {
    const sessionStore = createMockSessionStore();
    const deps = createDefaultDeps({ sessionStore });
    const input: OrchestratorInput = {
      sessionId: 'sess-new',
      userId: 'user-1',
      message: 'Hello',
    };

    const output = await handleMessage(input, deps);

    expect(output.sessionId).toBe('sess-new');
    expect(output.response.content).toBeDefined();

    // Session should be persisted
    const savedSession = sessionStore.sessions.get('sess-new');
    expect(savedSession).toBeDefined();
    expect(savedSession!.conversationHistory.length).toBeGreaterThan(0);
  });

  it('loads existing session from store', async () => {
    const sessionStore = createMockSessionStore();
    const existingSession = createNewSession('sess-existing', 'user-1');
    existingSession.conversationHistory.push({
      role: 'user',
      content: 'Previous message',
      timestamp: Date.now() - 1000,
    });
    sessionStore.sessions.set('sess-existing', existingSession);

    const deps = createDefaultDeps({ sessionStore });
    const input: OrchestratorInput = {
      sessionId: 'sess-existing',
      userId: 'user-1',
      message: 'Another message',
    };

    const output = await handleMessage(input, deps);

    expect(output.sessionId).toBe('sess-existing');
    const savedSession = sessionStore.sessions.get('sess-existing');
    // Should have previous + user + assistant messages
    expect(savedSession!.conversationHistory.length).toBe(3);
  });

  it('triggers onboarding for cold-start users', async () => {
    const deps = createDefaultDeps({
      preferenceStore: createMockPreferenceStore(null), // No profile = cold start
    });
    const input: OrchestratorInput = {
      sessionId: 'sess-cold',
      userId: 'user-new',
      message: 'Hi',
    };

    const output = await handleMessage(input, deps);

    expect(output.response.content).toContain('KiranaAI');
    // Should contain a question
    expect(output.response.content).toContain('?');
  });

  it('does NOT trigger onboarding for existing users with preferences', async () => {
    const deps = createDefaultDeps();
    const input: OrchestratorInput = {
      sessionId: 'sess-1',
      userId: 'user-1',
      message: 'I want milk',
    };

    const output = await handleMessage(input, deps);

    // Should get a normal agent response, not onboarding
    expect(output.response.content).not.toContain('Welcome to KiranaAI');
  });

  it('triggers basket completion when cart has items and < 2 suggestions given', async () => {
    const sessionStore = createMockSessionStore();
    const session = createNewSession('sess-basket', 'user-1');
    session.cartState = [
      { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
    ];
    sessionStore.sessions.set('sess-basket', session);

    const deps = createDefaultDeps({ sessionStore });
    const input: OrchestratorInput = {
      sessionId: 'sess-basket',
      userId: 'user-1',
      message: 'What else should I get?',
    };

    const output = await handleMessage(input, deps);

    // Basket completion engine uses co-occurrence rules.
    // With Milk in cart, it may suggest Bread, Butter, Sugar etc.
    // Since our catalog has Bread and Butter, we should get suggestions
    expect(output.basketSuggestions).toBeDefined();
    if (output.basketSuggestions && output.basketSuggestions.length > 0) {
      expect(output.basketSuggestions.length).toBeLessThanOrEqual(2);
      expect(output.basketSuggestions[0].product).toBeDefined();
      expect(output.basketSuggestions[0].reason).toBeDefined();
    }
  });

  it('triggers gap-fill when cart total < free delivery threshold', async () => {
    const sessionStore = createMockSessionStore();
    const session = createNewSession('sess-gap', 'user-1');
    session.cartState = [
      { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
    ];
    sessionStore.sessions.set('sess-gap', session);

    const deps = createDefaultDeps({ sessionStore, freeDeliveryThreshold: 199 });
    const input: OrchestratorInput = {
      sessionId: 'sess-gap',
      userId: 'user-1',
      message: 'Am I close to free delivery?',
    };

    const output = await handleMessage(input, deps);

    // Cart total is 28, threshold is 199 → gap-fill should trigger
    expect(output.gapFillSuggestion).toBeDefined();
    if (output.gapFillSuggestion) {
      expect(output.gapFillSuggestion.product.price).toBeGreaterThan(0);
    }
  });

  it('does NOT trigger gap-fill when cart total >= threshold', async () => {
    const sessionStore = createMockSessionStore();
    const session = createNewSession('sess-no-gap', 'user-1');
    session.cartState = [
      { productId: 'rice-001', name: 'Rice', price: 180, quantity: 1 },
      { productId: 'bread-001', name: 'Bread', price: 40, quantity: 1 },
    ];
    sessionStore.sessions.set('sess-no-gap', session);

    const deps = createDefaultDeps({ sessionStore, freeDeliveryThreshold: 199 });
    const input: OrchestratorInput = {
      sessionId: 'sess-no-gap',
      userId: 'user-1',
      message: 'Do I need anything else?',
    };

    const output = await handleMessage(input, deps);

    // Cart total = 220, threshold = 199 → no gap-fill
    expect(output.gapFillSuggestion).toBeUndefined();
  });

  it('does NOT trigger gap-fill after 1 suggestion already given', async () => {
    const sessionStore = createMockSessionStore();
    const session = createNewSession('sess-gap-done', 'user-1');
    session.cartState = [
      { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
    ];
    session.suggestionsGiven.gapFill = 1; // Already given
    sessionStore.sessions.set('sess-gap-done', session);

    const deps = createDefaultDeps({ sessionStore, freeDeliveryThreshold: 199 });
    const input: OrchestratorInput = {
      sessionId: 'sess-gap-done',
      userId: 'user-1',
      message: 'Suggest something for free delivery',
    };

    const output = await handleMessage(input, deps);

    expect(output.gapFillSuggestion).toBeUndefined();
  });

  it('persists session after processing', async () => {
    const sessionStore = createMockSessionStore();
    const deps = createDefaultDeps({ sessionStore });
    const input: OrchestratorInput = {
      sessionId: 'sess-persist',
      userId: 'user-1',
      message: 'Testing persistence',
    };

    await handleMessage(input, deps);

    const saved = sessionStore.sessions.get('sess-persist');
    expect(saved).toBeDefined();
    expect(saved!.lastActivityAt).toBeGreaterThan(0);
  });
});

describe('Orchestrator - Dietary Restriction Enforcement', () => {
  it('filters products violating vegetarian flag', () => {
    const filtered = filterByDietaryRestrictions(MOCK_CATALOG, ['vegetarian']);
    const hasChicken = filtered.some((p) => p.productId === 'chicken-001');
    expect(hasChicken).toBe(false);
    // Milk should still be present
    const hasMilk = filtered.some((p) => p.productId === 'milk-001');
    expect(hasMilk).toBe(true);
  });

  it('filters products violating dairy-free flag', () => {
    const filtered = filterByDietaryRestrictions(MOCK_CATALOG, ['dairy-free']);
    const hasMilk = filtered.some((p) => p.productId === 'milk-001');
    const hasButter = filtered.some((p) => p.productId === 'butter-001');
    expect(hasMilk).toBe(false);
    expect(hasButter).toBe(false);
    // Rice should still be present
    const hasRice = filtered.some((p) => p.productId === 'rice-001');
    expect(hasRice).toBe(true);
  });

  it('filters products violating low-sugar flag', () => {
    const filtered = filterByDietaryRestrictions(MOCK_CATALOG, ['low-sugar']);
    const hasJam = filtered.some((p) => p.productId === 'jam-001');
    expect(hasJam).toBe(false);
    // Milk should still be present
    const hasMilk = filtered.some((p) => p.productId === 'milk-001');
    expect(hasMilk).toBe(true);
  });

  it('returns all products when no dietary flags set', () => {
    const filtered = filterByDietaryRestrictions(MOCK_CATALOG, []);
    expect(filtered.length).toBe(MOCK_CATALOG.length);
  });

  it('applies multiple dietary flags simultaneously', () => {
    const filtered = filterByDietaryRestrictions(MOCK_CATALOG, ['vegetarian', 'dairy-free']);
    // Chicken is excluded (non-veg)
    expect(filtered.some((p) => p.productId === 'chicken-001')).toBe(false);
    // Milk is excluded (dairy)
    expect(filtered.some((p) => p.productId === 'milk-001')).toBe(false);
    // Rice should still pass
    expect(filtered.some((p) => p.productId === 'rice-001')).toBe(true);
  });

  it('filters product cards by dietary restrictions', () => {
    const cards: ProductCard[] = [
      { productId: 'milk-001', name: 'Milk', price: 28 },
      { productId: 'rice-001', name: 'Rice', price: 180 },
      { productId: 'chicken-001', name: 'Chicken Breast', price: 250 },
    ];
    const filtered = filterCardsByDietaryRestrictions(cards, ['vegetarian'], MOCK_CATALOG);
    expect(filtered.length).toBe(2);
    expect(filtered.some((c) => c.productId === 'chicken-001')).toBe(false);
  });

  it('filters product suggestions by dietary restrictions', () => {
    const suggestions: ProductSuggestion[] = [
      {
        product: MOCK_CATALOG.find((p) => p.productId === 'chicken-001')!,
        reason: 'Good protein source',
        confidence: 0.8,
      },
      {
        product: MOCK_CATALOG.find((p) => p.productId === 'rice-001')!,
        reason: 'Goes with dal',
        confidence: 0.9,
      },
    ];
    const filtered = filterSuggestionsByDietaryRestrictions(suggestions, ['vegetarian']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].product.productId).toBe('rice-001');
  });

  it('enforces dietary restrictions on agent response products', async () => {
    const vegProfile: UserProfile = {
      userId: 'user-veg',
      dietaryFlags: ['vegetarian'],
      brandLoyalty: [{ category: 'dairy', brand: 'Amul', score: 80, lastUpdated: Date.now() }],
      qualityPreferences: [{ category: 'general', toleranceLevel: 'moderate', priceWeight: 0.5, brandWeight: 0.5 }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const agentProvider = createMockAgentProvider({
      content: 'Here are some options:',
      products: [
        { productId: 'milk-001', name: 'Milk', price: 28 },
        { productId: 'chicken-001', name: 'Chicken Breast', price: 250 },
        { productId: 'rice-001', name: 'Rice', price: 180 },
      ],
    });

    const deps = createDefaultDeps({
      preferenceStore: createMockPreferenceStore(vegProfile),
      agentProvider,
    });
    const input: OrchestratorInput = {
      sessionId: 'sess-veg',
      userId: 'user-veg',
      message: 'Suggest something for dinner',
    };

    const output = await handleMessage(input, deps);

    // Chicken should be filtered out for vegetarian user
    expect(output.response.products).toBeDefined();
    expect(output.response.products!.some((p) => p.productId === 'chicken-001')).toBe(false);
    // Milk and Rice should remain
    expect(output.response.products!.some((p) => p.productId === 'milk-001')).toBe(true);
    expect(output.response.products!.some((p) => p.productId === 'rice-001')).toBe(true);
  });
});

describe('Orchestrator - createNewSession', () => {
  it('creates session with correct initial state', () => {
    const session = createNewSession('sess-1', 'user-1');

    expect(session.sessionId).toBe('sess-1');
    expect(session.userId).toBe('user-1');
    expect(session.conversationHistory).toEqual([]);
    expect(session.cartState).toEqual([]);
    expect(session.agentReasoningHistory).toEqual([]);
    expect(session.suggestionsGiven.basketCompletion).toBe(0);
    expect(session.suggestionsGiven.gapFill).toBe(0);
    expect(session.onboardingState).toBeUndefined();
  });
});
