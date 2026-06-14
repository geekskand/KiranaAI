/**
 * Property-Based Test: One Question Per Turn (Property 1)
 *
 * For any user message sent to the Conversational Agent, the agent's response
 * SHALL contain at most one interrogative question (i.e., at most one '?' character).
 *
 * **Validates: Requirements 1.4, 3.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RuleBasedAgentProvider } from './rule-based.js';
import type { AgentContext } from '../../models/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Create a minimal AgentContext for testing. */
function createTestContext(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): AgentContext {
  return {
    sessionId: 'test-session',
    userId: 'test-user',
    conversationHistory: conversationHistory.map((msg) => ({
      ...msg,
      timestamp: Date.now(),
    })),
    cartState: [],
  };
}

/** Count the number of '?' characters in a string. */
function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) || []).length;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generator for arbitrary user messages (random unicode strings). */
const arbitraryMessageArb = fc.string({ minLength: 1, maxLength: 200 });

/** Generator for messages that match known intents. */
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
    'do you have eggs'
  ),
  // Add-to-cart intents
  fc.constantFrom(
    'add milk to cart',
    'buy some bread',
    'get me eggs',
    "i'll take the rice",
    'put butter in cart'
  ),
  // Substitute intents
  fc.constantFrom(
    'find a substitute for milk',
    'alternative to bread',
    'replace butter with something',
    'something like yogurt',
    'other option for rice'
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
    'budget is important to me'
  ),
  // Unknown / fallback
  fc.constantFrom(
    'asdfghjkl',
    '12345',
    'xyzzy',
    '...',
    'hmm okay'
  )
);

/** Combined generator: mix of arbitrary strings and known-intent messages. */
const userMessageArb = fc.oneof(
  { weight: 3, arbitrary: intentMessageArb },
  { weight: 1, arbitrary: arbitraryMessageArb }
);

/** Generator for conversation history (0-5 prior messages). */
const conversationHistoryArb = fc.array(
  fc.record({
    role: fc.constantFrom('user' as const, 'assistant' as const),
    content: fc.string({ minLength: 1, maxLength: 100 }),
  }),
  { minLength: 0, maxLength: 5 }
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 1: One Question Per Turn', () => {
  const agent = new RuleBasedAgentProvider({ deterministic: true });

  it('for any user message, the agent response contains at most one "?" character', async () => {
    await fc.assert(
      fc.asyncProperty(userMessageArb, async (message) => {
        const context = createTestContext();
        const response = await agent.invoke(context, message);

        const questionCount = countQuestionMarks(response.content);

        expect(questionCount).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 }
    );
  });

  it('for any user message with conversation history, response contains at most one "?"', async () => {
    await fc.assert(
      fc.asyncProperty(
        userMessageArb,
        conversationHistoryArb,
        async (message, history) => {
          const context = createTestContext(history);
          const response = await agent.invoke(context, message);

          const questionCount = countQuestionMarks(response.content);

          expect(questionCount).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('for known intent messages, the agent response contains at most one "?"', async () => {
    await fc.assert(
      fc.asyncProperty(intentMessageArb, async (message) => {
        const context = createTestContext();
        const response = await agent.invoke(context, message);

        const questionCount = countQuestionMarks(response.content);

        expect(questionCount).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 }
    );
  });
});
