/**
 * Property-Based Test: Session Data Round-Trip (Property 13)
 *
 * Any session context written to the InMemorySessionStore reads back identically.
 * This verifies the deep-clone-on-read/write behavior preserves all data.
 *
 * **Validates: Requirements 8.1**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InMemorySessionStore } from './in-memory.js';
import type {
  SessionContext,
  Message,
  CartItem,
  ReasoningStep,
  OnboardingState,
  ProductCard,
} from '../../models/index.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const arbProductCard: fc.Arbitrary<ProductCard> = fc.record({
  productId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  price: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
  reason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

const arbMessage: fc.Arbitrary<Message> = fc.record({
  role: fc.constantFrom('user' as const, 'assistant' as const),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  products: fc.option(fc.array(arbProductCard, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  timestamp: fc.nat(),
});

const arbCartItem: fc.Arbitrary<CartItem> = fc.record({
  productId: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  price: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
  quantity: fc.integer({ min: 1, max: 100 }),
});

const arbReasoningStep: fc.Arbitrary<ReasoningStep> = fc.record({
  tool: fc.string({ minLength: 1, maxLength: 30 }),
  input: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.oneof(fc.string(), fc.integer(), fc.boolean())
  ) as fc.Arbitrary<Record<string, unknown>>,
  output: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.oneof(fc.string(), fc.integer(), fc.boolean())
  ) as fc.Arbitrary<Record<string, unknown>>,
  timestamp: fc.nat(),
});

const arbOnboardingState: fc.Arbitrary<OnboardingState> = fc.record({
  questionsAsked: fc.integer({ min: 0, max: 5 }),
  questionsTotal: fc.integer({ min: 3, max: 5 }),
  answers: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 100 })
  ),
  complete: fc.boolean(),
});

const arbSessionContext: fc.Arbitrary<SessionContext> = fc.record({
  sessionId: fc.uuid(),
  userId: fc.uuid(),
  conversationHistory: fc.array(arbMessage, { minLength: 0, maxLength: 10 }),
  cartState: fc.array(arbCartItem, { minLength: 0, maxLength: 10 }),
  agentReasoningHistory: fc.array(arbReasoningStep, { minLength: 0, maxLength: 5 }),
  onboardingState: fc.option(arbOnboardingState, { nil: undefined }),
  suggestionsGiven: fc.record({
    basketCompletion: fc.integer({ min: 0, max: 2 }),
    gapFill: fc.integer({ min: 0, max: 1 }),
  }),
  createdAt: fc.nat(),
  lastActivityAt: fc.nat(),
});

// ─── Property Test ───────────────────────────────────────────────────────────

describe('Property 13: Session Data Round-Trip', () => {
  it('any session context written to InMemorySessionStore reads back identically', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionContext, async (session) => {
        const store = new InMemorySessionStore();

        await store.saveSession(session.sessionId, session);
        const retrieved = await store.getSession(session.sessionId);

        expect(retrieved).toEqual(session);
      }),
      { numRuns: 100 }
    );
  });

  it('read-back data is a distinct reference (deep clone), not the same object', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionContext, async (session) => {
        const store = new InMemorySessionStore();

        await store.saveSession(session.sessionId, session);
        const retrieved = await store.getSession(session.sessionId);

        // The retrieved object must not be the same reference
        expect(retrieved).not.toBe(session);
        if (retrieved!.conversationHistory.length > 0) {
          expect(retrieved!.conversationHistory).not.toBe(session.conversationHistory);
        }
        if (retrieved!.cartState.length > 0) {
          expect(retrieved!.cartState).not.toBe(session.cartState);
        }
      }),
      { numRuns: 50 }
    );
  });
});
