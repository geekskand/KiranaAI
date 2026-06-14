/**
 * End-to-End Integration Tests for KiranaAI.
 *
 * Tests the full pipeline using local fallback providers (no AWS services required).
 * Exercises:
 * 1. Full message flow: user message → orchestrator → agent → response
 * 2. Onboarding flow: cold-start user → questions → preferences stored
 * 3. Basket completion triggering (≤2 suggestions)
 * 4. Gap-fill triggering (≤1 suggestion)
 * 5. Provider fallback: primary failure → fallback used
 *
 * Validates: Requirements 1.2, 3.1, 6.1, 7.1, 14.1
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { createLocalRegistry, ProviderRegistry } from '../providers/registry.js';
import { handleMessage, orchestrate, type OrchestratorDeps, type OrchestratorInput } from '../handlers/orchestrator.js';
import { InMemorySessionStore } from '../providers/session/in-memory.js';
import { LocalJsonPreferenceStore } from '../providers/preference/local-json.js';
import { RuleBasedAgentProvider } from '../providers/agent/rule-based.js';
import { catalog } from '../seed/catalog.js';
import type { SessionContext, Product } from '../models/index.js';
import type { AgentProvider, PreferenceStoreProvider, SessionStoreProvider } from '../providers/interfaces.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), 'kirana-e2e-tests');
let testFileCounter = 0;

function freshTestFile(): string {
  testFileCounter++;
  return join(TEST_DIR, `e2e-prefs-${testFileCounter}-${Date.now()}.json`);
}

/**
 * A test catalog with simple product names matching the basket completion
 * co-occurrence rules. The real seed catalog uses full branded names,
 * but the co-occurrence engine matches on simple names like "Milk", "Bread".
 */
const testCatalog: Product[] = [
  { productId: 'p-milk', name: 'Milk', price: 60, category: 'dairy', brand: 'Amul', labels: [] },
  { productId: 'p-bread', name: 'Bread', price: 40, category: 'bakery', brand: 'Britannia', labels: [] },
  { productId: 'p-butter', name: 'Butter', price: 55, category: 'dairy', brand: 'Amul', labels: ['dairy'] },
  { productId: 'p-jam', name: 'Jam', price: 120, category: 'spreads', brand: 'Kissan', labels: [] },
  { productId: 'p-eggs', name: 'Eggs', price: 80, category: 'protein', brand: 'Farm Fresh', labels: [] },
  { productId: 'p-rice', name: 'Rice', price: 150, category: 'grains', brand: 'India Gate', labels: [] },
  { productId: 'p-dal', name: 'Dal', price: 110, category: 'pulses', brand: 'Tata', labels: [] },
  { productId: 'p-oil', name: 'Oil', price: 180, category: 'cooking', brand: 'Fortune', labels: [] },
  { productId: 'p-sugar', name: 'Sugar', price: 45, category: 'essentials', brand: 'Dhampure', labels: [] },
  { productId: 'p-tea', name: 'Tea', price: 200, category: 'beverages', brand: 'Tata', labels: [] },
  { productId: 'p-salt', name: 'Salt', price: 20, category: 'essentials', brand: 'Tata', labels: [] },
  { productId: 'p-biscuits', name: 'Biscuits', price: 30, category: 'snacks', brand: 'Parle', labels: [] },
  { productId: 'p-onions', name: 'Onions', price: 35, category: 'vegetables', brand: 'Local', labels: [] },
  { productId: 'p-tomatoes', name: 'Tomatoes', price: 40, category: 'vegetables', brand: 'Local', labels: [] },
  { productId: 'p-flour', name: 'Flour', price: 55, category: 'grains', brand: 'Aashirvaad', labels: [] },
];

function createTestDeps(overrides?: Partial<OrchestratorDeps>): OrchestratorDeps {
  return {
    sessionStore: new InMemorySessionStore(),
    preferenceStore: new LocalJsonPreferenceStore(freshTestFile()),
    agentProvider: new RuleBasedAgentProvider({ deterministic: true }),
    catalog: testCatalog,
    freeDeliveryThreshold: 499,
    ...overrides,
  };
}

function createInput(overrides?: Partial<OrchestratorInput>): OrchestratorInput {
  return {
    sessionId: 'test-session-1',
    userId: 'test-user-1',
    message: 'hello',
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('E2E Integration Tests', () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });
  // ─── 1. Full Message Flow ────────────────────────────────────────────────

  describe('Full message flow (Req 1.2)', () => {
    it('should process a user message and return an agent response', async () => {
      const deps = createTestDeps();
      // Set up a user profile so onboarding doesn't trigger
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      const input = createInput({ message: 'show me some milk' });
      const result = await handleMessage(input, deps);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('test-session-1');
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeTruthy();
      expect(typeof result.response.content).toBe('string');
    });

    it('should include product cards in search responses', async () => {
      const deps = createTestDeps();
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      const input = createInput({ message: 'find me some rice' });
      const result = await handleMessage(input, deps);

      expect(result.response.content).toBeTruthy();
      // The rule-based agent returns product cards for search intents
      expect(result.response.products).toBeDefined();
      expect(result.response.products!.length).toBeGreaterThan(0);
      expect(result.response.products![0]).toHaveProperty('name');
      expect(result.response.products![0]).toHaveProperty('price');
      expect(result.response.products![0]).toHaveProperty('productId');
    });

    it('should persist conversation history in the session', async () => {
      const deps = createTestDeps();
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      const input = createInput({ message: 'hello' });
      await handleMessage(input, deps);

      // Check that session was saved with conversation history
      const session = await deps.sessionStore.getSession('test-session-1');
      expect(session).toBeDefined();
      expect(session!.conversationHistory.length).toBe(2); // user + assistant
      expect(session!.conversationHistory[0].role).toBe('user');
      expect(session!.conversationHistory[1].role).toBe('assistant');
    });

    it('should maintain session context across multiple messages', async () => {
      const deps = createTestDeps();
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      // Send first message
      await handleMessage(createInput({ message: 'hi' }), deps);
      // Send second message
      await handleMessage(createInput({ message: 'find milk' }), deps);

      const session = await deps.sessionStore.getSession('test-session-1');
      expect(session).toBeDefined();
      // Should have 4 messages: user1, assistant1, user2, assistant2
      expect(session!.conversationHistory.length).toBe(4);
    });
  });

  // ─── 2. Onboarding Flow ──────────────────────────────────────────────────

  describe('Onboarding flow (Req 3.1)', () => {
    it('should trigger onboarding for a cold-start user', async () => {
      const deps = createTestDeps();
      // No profile data → cold-start user

      const input = createInput({ message: 'hi' });
      const result = await handleMessage(input, deps);

      expect(result.response.content).toBeTruthy();
      // First response should be an onboarding question
      expect(result.response.content.toLowerCase()).toContain('preference');
    });

    it('should complete onboarding flow with all questions answered', async () => {
      const deps = createTestDeps();
      const sessionId = 'onboarding-session';
      const userId = 'new-user';

      // Turn 1: Trigger onboarding (first message from cold-start user)
      const result1 = await handleMessage(
        { sessionId, userId, message: 'hello' },
        deps
      );
      expect(result1.response.content).toContain('?');

      // Turn 2: Answer dietary question
      const result2 = await handleMessage(
        { sessionId, userId, message: 'I am vegetarian and prefer low-sugar options' },
        deps
      );
      expect(result2.response.content).toBeTruthy();

      // Turn 3: Answer budget question
      const result3 = await handleMessage(
        { sessionId, userId, message: 'I prefer budget-friendly options' },
        deps
      );
      expect(result3.response.content).toBeTruthy();

      // Turn 4: Answer brands question
      const result4 = await handleMessage(
        { sessionId, userId, message: 'I like Amul for dairy, Tata for staples' },
        deps
      );
      expect(result4.response.content).toBeTruthy();

      // Turn 5: Answer categories question
      const result5 = await handleMessage(
        { sessionId, userId, message: 'dairy, snacks, grains' },
        deps
      );
      expect(result5.response.content).toBeTruthy();

      // Turn 6: Answer substitutions question — this should complete onboarding
      const result6 = await handleMessage(
        { sessionId, userId, message: 'I am moderate about substitutions' },
        deps
      );
      expect(result6.response.content).toBeTruthy();

      // Verify onboarding is complete — session should show completed state
      const session = await deps.sessionStore.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.onboardingState).toBeDefined();
      expect(session!.onboardingState!.complete).toBe(true);

      // Verify preferences were persisted in the preference store
      const profile = await deps.preferenceStore.getUserProfile(userId);
      expect(profile).toBeDefined();
      expect(profile!.dietaryFlags.length).toBeGreaterThan(0);
      expect(profile!.dietaryFlags).toContain('vegetarian');
    });

    it('should not trigger onboarding for users with existing preferences', async () => {
      const deps = createTestDeps();
      // Pre-populate user preferences
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');
      await deps.preferenceStore.updateBrandLoyalty('test-user-1', 'dairy', 'Amul', 70);

      const input = createInput({ message: 'hi' });
      const result = await handleMessage(input, deps);

      // Should NOT be an onboarding question (no "dietary preferences" prompt)
      // Instead should be a normal greeting response
      expect(result.response.content).not.toContain('dietary preferences');
    });
  });

  // ─── 3. Basket Completion Triggering ─────────────────────────────────────

  describe('Basket completion (Req 6.1)', () => {
    it('should trigger basket suggestions when cart has items', async () => {
      const deps = createTestDeps();
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      // Pre-populate session with cart items that match co-occurrence rules
      const sessionWithCart: SessionContext = {
        sessionId: 'test-session-1',
        userId: 'test-user-1',
        conversationHistory: [],
        cartState: [
          { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
        ],
        agentReasoningHistory: [],
        suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      await deps.sessionStore.saveSession('test-session-1', sessionWithCart);

      const input = createInput({ message: 'what else do I need?' });
      const result = await handleMessage(input, deps);

      // Basket suggestions should be triggered
      expect(result.basketSuggestions).toBeDefined();
      expect(result.basketSuggestions!.length).toBeGreaterThan(0);
      expect(result.basketSuggestions!.length).toBeLessThanOrEqual(2);

      // Each suggestion should have product info and reason
      for (const suggestion of result.basketSuggestions!) {
        expect(suggestion.product).toBeDefined();
        expect(suggestion.product.name).toBeTruthy();
        expect(suggestion.product.price).toBeGreaterThan(0);
        expect(suggestion.reason).toBeTruthy();
      }
    });

    it('should enforce max 2 basket suggestions per session', async () => {
      const deps = createTestDeps();
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      // Session that already received 2 basket suggestions
      const sessionWithMaxSuggestions: SessionContext = {
        sessionId: 'test-session-1',
        userId: 'test-user-1',
        conversationHistory: [],
        cartState: [
          { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
        ],
        agentReasoningHistory: [],
        suggestionsGiven: { basketCompletion: 2, gapFill: 0 },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      await deps.sessionStore.saveSession('test-session-1', sessionWithMaxSuggestions);

      const input = createInput({ message: 'anything else?' });
      const result = await handleMessage(input, deps);

      // Should NOT trigger more basket suggestions (limit reached)
      expect(result.basketSuggestions).toBeUndefined();
    });
  });

  // ─── 4. Gap-Fill Triggering ──────────────────────────────────────────────

  describe('Gap-fill (Req 7.1)', () => {
    it('should trigger gap-fill suggestion when cart is below threshold', async () => {
      const deps = createTestDeps({ freeDeliveryThreshold: 499 });
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      // Cart total = 28 (well below 499 threshold)
      const sessionWithLowCart: SessionContext = {
        sessionId: 'test-session-1',
        userId: 'test-user-1',
        conversationHistory: [],
        cartState: [
          { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
        ],
        agentReasoningHistory: [],
        suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      await deps.sessionStore.saveSession('test-session-1', sessionWithLowCart);

      const input = createInput({ message: 'show me options' });
      const result = await handleMessage(input, deps);

      // Gap-fill should be triggered
      expect(result.gapFillSuggestion).toBeDefined();
      expect(result.gapFillSuggestion).not.toBeNull();
      expect(result.gapFillSuggestion!.product).toBeDefined();
      expect(result.gapFillSuggestion!.product.price).toBeGreaterThan(0);
      expect(result.gapFillSuggestion!.reason).toBeTruthy();
    });

    it('should enforce max 1 gap-fill suggestion per session', async () => {
      const deps = createTestDeps({ freeDeliveryThreshold: 499 });
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      // Session that already received 1 gap-fill suggestion
      const sessionWithGapFill: SessionContext = {
        sessionId: 'test-session-1',
        userId: 'test-user-1',
        conversationHistory: [],
        cartState: [
          { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
        ],
        agentReasoningHistory: [],
        suggestionsGiven: { basketCompletion: 0, gapFill: 1 },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      await deps.sessionStore.saveSession('test-session-1', sessionWithGapFill);

      const input = createInput({ message: 'anything else?' });
      const result = await handleMessage(input, deps);

      // Should NOT trigger gap-fill (limit reached)
      expect(result.gapFillSuggestion).toBeUndefined();
    });

    it('should not trigger gap-fill when cart is at or above threshold', async () => {
      const deps = createTestDeps({ freeDeliveryThreshold: 499 });
      await deps.preferenceStore.setDietaryFlag('test-user-1', 'vegetarian');

      // Cart total = 500 (above threshold)
      const sessionAboveThreshold: SessionContext = {
        sessionId: 'test-session-1',
        userId: 'test-user-1',
        conversationHistory: [],
        cartState: [
          { productId: 'rice-001', name: 'Rice', price: 500, quantity: 1 },
        ],
        agentReasoningHistory: [],
        suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      await deps.sessionStore.saveSession('test-session-1', sessionAboveThreshold);

      const input = createInput({ message: 'done shopping' });
      const result = await handleMessage(input, deps);

      // No gap-fill needed since we're above threshold
      expect(result.gapFillSuggestion).toBeUndefined();
    });
  });

  // ─── 5. Provider Fallback on Health Check Failure ────────────────────────

  describe('Provider fallback (Req 14.1)', () => {
    it('should use fallback agent when primary health check fails', async () => {
      // Create a registry where the primary agent is broken
      const registry = createLocalRegistry();

      // Re-register agent with a broken primary and working fallback
      const brokenAgent: AgentProvider = {
        invoke: async () => { throw new Error('Bedrock unavailable'); },
      };
      const fallbackAgent = new RuleBasedAgentProvider({ deterministic: true });

      registry.registerAgent(
        brokenAgent,
        fallbackAgent,
        async () => false // health check fails
      );

      // Also ensure user has preferences to skip onboarding
      const prefStore = await registry.preferenceStore;
      await prefStore.setDietaryFlag('test-user-1', 'vegetarian');

      const input = createInput({ message: 'hi' });
      const result = await orchestrate(input, registry);

      // Should get a valid response from the fallback agent
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeTruthy();
    });

    it('should use fallback session store when primary health check fails', async () => {
      const registry = createLocalRegistry();

      // Re-register session store with a broken primary
      const brokenSession: SessionStoreProvider = {
        getSession: async () => { throw new Error('Redis unavailable'); },
        saveSession: async () => { throw new Error('Redis unavailable'); },
        deleteSession: async () => { throw new Error('Redis unavailable'); },
      };
      const fallbackSession = new InMemorySessionStore();

      registry.registerSessionStore(
        brokenSession,
        fallbackSession,
        async () => false // health check fails → use fallback
      );

      // Ensure user has preferences
      const prefStore = await registry.preferenceStore;
      await prefStore.setDietaryFlag('test-user-1', 'vegetarian');

      const input = createInput({ message: 'hello' });
      const result = await orchestrate(input, registry);

      // Should work via fallback session store
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeTruthy();

      // Verify session was persisted in fallback store
      const session = await fallbackSession.getSession('test-session-1');
      expect(session).toBeDefined();
    });

    it('should use createLocalRegistry for full local development mode', async () => {
      const registry = createLocalRegistry();

      // Ensure user has preferences
      const prefStore = await registry.preferenceStore;
      await prefStore.setDietaryFlag('local-user', 'vegetarian');

      const input: OrchestratorInput = {
        sessionId: 'local-session',
        userId: 'local-user',
        message: 'find me rice',
      };

      const result = await orchestrate(input, registry);

      expect(result.response).toBeDefined();
      expect(result.response.content).toBeTruthy();
      expect(result.sessionId).toBe('local-session');
      // All fallback providers should work without any external services
      expect(registry.isLocal()).toBe(true);
    });

    it('should use fallback preference store when primary health check fails', async () => {
      const registry = createLocalRegistry();

      // Re-register preference store with a broken primary
      const brokenPrefStore: PreferenceStoreProvider = {
        getUserProfile: async () => { throw new Error('DynamoDB unavailable'); },
        updateBrandLoyalty: async () => { throw new Error('DynamoDB unavailable'); },
        setDietaryFlag: async () => { throw new Error('DynamoDB unavailable'); },
        getPreferences: async () => { throw new Error('DynamoDB unavailable'); },
      };
      const fallbackPrefStore = new LocalJsonPreferenceStore(freshTestFile());

      registry.registerPreferenceStore(
        brokenPrefStore,
        fallbackPrefStore,
        async () => false // health check fails → use fallback
      );

      // Set up preferences in the fallback
      await fallbackPrefStore.setDietaryFlag('test-user-1', 'vegetarian');

      const input = createInput({ message: 'hi' });
      const result = await orchestrate(input, registry);

      // Should work via fallback preference store
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeTruthy();
    });
  });

  // ─── Combined Flow ───────────────────────────────────────────────────────

  describe('Combined end-to-end flow', () => {
    it('should handle full lifecycle: onboarding → message → basket → gap-fill', async () => {
      const deps = createTestDeps({ freeDeliveryThreshold: 499 });
      const sessionId = 'lifecycle-session';
      const userId = 'lifecycle-user';

      // Step 1: Onboarding (cold-start user triggers onboarding)
      const onboard1 = await handleMessage(
        { sessionId, userId, message: 'hi' },
        deps
      );
      expect(onboard1.response.content).toContain('?');

      // Answer all onboarding questions
      await handleMessage({ sessionId, userId, message: 'vegetarian' }, deps);
      await handleMessage({ sessionId, userId, message: 'budget' }, deps);
      await handleMessage({ sessionId, userId, message: 'Amul for dairy' }, deps);
      await handleMessage({ sessionId, userId, message: 'dairy, snacks' }, deps);
      const onboardComplete = await handleMessage(
        { sessionId, userId, message: 'moderate substitutions' },
        deps
      );

      // Verify onboarding completed
      const session = await deps.sessionStore.getSession(sessionId);
      expect(session!.onboardingState!.complete).toBe(true);

      // Step 2: Regular message after onboarding
      const normalMsg = await handleMessage(
        { sessionId, userId, message: 'show me milk options' },
        deps
      );
      expect(normalMsg.response.content).toBeTruthy();
      expect(normalMsg.response.products).toBeDefined();

      // Step 3: Add item to cart (manually update session for basket/gap-fill testing)
      const updatedSession = await deps.sessionStore.getSession(sessionId);
      updatedSession!.cartState = [
        { productId: 'milk-001', name: 'Milk', price: 28, quantity: 1 },
      ];
      updatedSession!.suggestionsGiven = { basketCompletion: 0, gapFill: 0 };
      await deps.sessionStore.saveSession(sessionId, updatedSession!);

      // Step 4: Next message should trigger basket completion and gap-fill
      const afterCart = await handleMessage(
        { sessionId, userId, message: 'what else should I get?' },
        deps
      );

      // Basket completion should fire (Milk has co-occurrence rules)
      expect(afterCart.basketSuggestions).toBeDefined();
      expect(afterCart.basketSuggestions!.length).toBeGreaterThan(0);
      expect(afterCart.basketSuggestions!.length).toBeLessThanOrEqual(2);

      // Gap-fill should fire (28 < 499 threshold)
      expect(afterCart.gapFillSuggestion).toBeDefined();
      expect(afterCart.gapFillSuggestion).not.toBeNull();
    });
  });
});
