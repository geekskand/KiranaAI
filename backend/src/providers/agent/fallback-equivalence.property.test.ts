/**
 * Property-Based Test: Fallback Agent Behavioral Equivalence (Property 17)
 *
 * For any user message processed by the fallback (rule-based) Conversational Agent,
 * the response SHALL:
 * 1. Maintain the same response format (text content + optional product cards)
 * 2. Adhere to the one-question-per-turn constraint (at most one '?' per response)
 * 3. Include confidence-based action routing (responses indicate auto-added/suggest/shortlist)
 *
 * **Validates: Requirements 11.1, 11.2**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RuleBasedAgentProvider } from './rule-based.js';
import type { AgentContext, Message, CartItem } from '../../models/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Valid action values for confidence-based routing. */
const VALID_ACTIONS = ['auto-added', 'suggest', 'shortlist'] as const;

/** Count the number of '?' characters in a string. */
function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) || []).length;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generator for arbitrary user messages. */
const arbitraryMessageArb = fc.string({ minLength: 1, maxLength: 200 });

/** Generator for messages matching known intents. */
const intentMessageArb = fc.oneof(
  // Greeting intents
  fc.constantFrom('hi', 'hello', 'hey', 'namaste', 'good morning', 'howdy'),
  // Search intents
  fc.constantFrom(
    'find me some milk',
    'show me bread options',
    'looking for organic rice',
    'i need sugar',
    'where is the butter',
    'do you have eggs',
    'show me vegetables',
    'find protein bars',
    'looking for ghee'
  ),
  // Add-to-cart intents
  fc.constantFrom(
    'add milk to cart',
    'buy some bread',
    'get me eggs',
    "i'll take the rice",
    'put butter in cart',
    'add paneer to cart',
    'buy organic honey'
  ),
  // Substitute intents
  fc.constantFrom(
    'find a substitute for milk',
    'alternative to bread',
    'replace butter with something',
    'something like yogurt',
    'other option for rice',
    'similar to almond milk'
  ),
  // Help intents
  fc.constantFrom(
    'help',
    'what can you do',
    'how do you work',
    'what do you do',
    'features'
  ),
  // Onboarding-answer intents
  fc.constantFrom(
    'i am vegetarian',
    "i'm vegan",
    'i prefer organic',
    'i like healthy food',
    "i don't eat gluten",
    'i avoid dairy',
    'budget is important to me',
    'i prefer low-sugar options'
  ),
  // Unknown / fallback
  fc.constantFrom(
    'asdfghjkl',
    '12345',
    'xyzzy',
    '...',
    'hmm okay',
    'random gibberish text'
  )
);

/** Combined generator: weighted mix of known intents and arbitrary strings. */
const userMessageArb = fc.oneof(
  { weight: 4, arbitrary: intentMessageArb },
  { weight: 1, arbitrary: arbitraryMessageArb }
);

/** Generator for a single message in conversation history. */
const messageArb: fc.Arbitrary<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = fc.record({
  role: fc.constantFrom('user' as const, 'assistant' as const),
  content: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: fc.nat({ max: 1700000000000 }),
});

/** Generator for conversation history (0-6 prior messages). */
const conversationHistoryArb: fc.Arbitrary<Message[]> = fc.array(
  messageArb,
  { minLength: 0, maxLength: 6 }
);

/** Generator for cart items. */
const cartItemArb: fc.Arbitrary<CartItem> = fc.record({
  productId: fc.string({ minLength: 3, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  price: fc.double({ min: 1, max: 500, noNaN: true }),
  quantity: fc.integer({ min: 1, max: 10 }),
});

/** Generator for cart state (0-5 items). */
const cartStateArb: fc.Arbitrary<CartItem[]> = fc.array(cartItemArb, { minLength: 0, maxLength: 5 });

/** Generator for a full AgentContext. */
const agentContextArb: fc.Arbitrary<AgentContext> = fc.record({
  sessionId: fc.string({ minLength: 5, maxLength: 30 }),
  userId: fc.string({ minLength: 3, maxLength: 20 }),
  conversationHistory: conversationHistoryArb,
  cartState: cartStateArb,
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 17: Fallback Agent Behavioral Equivalence', () => {
  const agent = new RuleBasedAgentProvider({ deterministic: true });

  describe('Response Format Compliance', () => {
    it('response always contains a non-empty text content field', async () => {
      await fc.assert(
        fc.asyncProperty(userMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          // Response must have content that is a non-empty string
          expect(response.content).toBeDefined();
          expect(typeof response.content).toBe('string');
          expect(response.content.length).toBeGreaterThan(0);
        }),
        { numRuns: 300 }
      );
    });

    it('when products are included, each product card has required fields (productId, name, price)', async () => {
      await fc.assert(
        fc.asyncProperty(userMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          if (response.products && response.products.length > 0) {
            for (const card of response.products) {
              expect(card.productId).toBeDefined();
              expect(typeof card.productId).toBe('string');
              expect(card.productId.length).toBeGreaterThan(0);

              expect(card.name).toBeDefined();
              expect(typeof card.name).toBe('string');
              expect(card.name.length).toBeGreaterThan(0);

              expect(card.price).toBeDefined();
              expect(typeof card.price).toBe('number');
              expect(card.price).toBeGreaterThan(0);
            }
          }
        }),
        { numRuns: 300 }
      );
    });

    it('products field is either undefined or an array of ProductCards', async () => {
      await fc.assert(
        fc.asyncProperty(userMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          if (response.products !== undefined) {
            expect(Array.isArray(response.products)).toBe(true);
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('One-Question-Per-Turn Constraint', () => {
    it('response contains at most one question mark for any user message and context', async () => {
      await fc.assert(
        fc.asyncProperty(userMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);
          const questionCount = countQuestionMarks(response.content);
          expect(questionCount).toBeLessThanOrEqual(1);
        }),
        { numRuns: 300 }
      );
    });

    it('response contains at most one question mark for intent-matched messages', async () => {
      await fc.assert(
        fc.asyncProperty(intentMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);
          const questionCount = countQuestionMarks(response.content);
          expect(questionCount).toBeLessThanOrEqual(1);
        }),
        { numRuns: 300 }
      );
    });
  });

  describe('Confidence-Based Action Routing', () => {
    it('when action is present, it is one of the valid confidence-routed actions', async () => {
      await fc.assert(
        fc.asyncProperty(userMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          if (response.action !== undefined) {
            expect(VALID_ACTIONS).toContain(response.action);
          }
        }),
        { numRuns: 300 }
      );
    });

    it('search intents produce responses with action routing (suggest action)', async () => {
      const searchMessageArb = fc.constantFrom(
        'find me some milk',
        'show me bread options',
        'looking for organic rice',
        'i need sugar',
        'where is the butter',
        'do you have eggs'
      );

      await fc.assert(
        fc.asyncProperty(searchMessageArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          // Search intents produce product suggestions with action routing
          expect(response.action).toBeDefined();
          expect(VALID_ACTIONS).toContain(response.action);
        }),
        { numRuns: 200 }
      );
    });

    it('add-to-cart intents with entity produce auto-added action', async () => {
      // Use messages where add-to-cart keyword is clearly at the start,
      // ensuring entity extraction succeeds (keyword followed by product name)
      const addToCartWithEntityArb = fc.constantFrom(
        'add milk to cart',
        'buy some bread',
        'get me eggs',
        "i'll take the rice",
        'add paneer to cart',
        'buy butter'
      );

      await fc.assert(
        fc.asyncProperty(addToCartWithEntityArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          // Explicit add-to-cart intents route with high confidence → auto-added
          expect(response.action).toBe('auto-added');
        }),
        { numRuns: 200 }
      );
    });

    it('substitute intents with entity produce suggest action', async () => {
      const substituteWithEntityArb = fc.constantFrom(
        'find a substitute for milk',
        'alternative to bread',
        'replace butter with something',
        'something like yogurt',
        'other option for rice'
      );

      await fc.assert(
        fc.asyncProperty(substituteWithEntityArb, agentContextArb, async (message, context) => {
          const response = await agent.invoke(context, message);

          // Substitute intents suggest alternatives
          expect(response.action).toBe('suggest');
        }),
        { numRuns: 200 }
      );
    });
  });
});
