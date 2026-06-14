/**
 * Unit tests for RuleBasedAgentProvider.
 *
 * Validates intent detection, templated response generation,
 * confidence scoring, one-question-per-turn constraint, and
 * product card formatting.
 *
 * Requirements: 11.1, 11.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleBasedAgentProvider, detectIntent } from './rule-based.js';
import type { AgentContext } from '../../models/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: 'test-session-1',
    userId: 'test-user-1',
    conversationHistory: [],
    cartState: [],
    ...overrides,
  };
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RuleBasedAgentProvider', () => {
  let agent: RuleBasedAgentProvider;
  let context: AgentContext;

  beforeEach(() => {
    agent = new RuleBasedAgentProvider({ deterministic: true });
    context = createContext();
  });

  describe('detectIntent', () => {
    describe('search intent', () => {
      it('detects "find" keyword', () => {
        const result = detectIntent('find me some rice');
        expect(result.type).toBe('search');
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      });

      it('detects "show me" keyword', () => {
        const result = detectIntent('show me organic milk');
        expect(result.type).toBe('search');
        expect(result.entity).toContain('organic milk');
      });

      it('detects "looking for" keyword', () => {
        const result = detectIntent('I am looking for bread');
        expect(result.type).toBe('search');
        expect(result.entity).toContain('bread');
      });

      it('detects "search for" keyword', () => {
        const result = detectIntent('search for sugar');
        expect(result.type).toBe('search');
        expect(result.entity).toContain('sugar');
      });

      it('detects "i need" keyword', () => {
        const result = detectIntent('i need some eggs');
        expect(result.type).toBe('search');
      });

      it('boosts confidence when entity is extracted', () => {
        const withEntity = detectIntent('find me rice');
        const withoutEntity = detectIntent('find');
        expect(withEntity.confidence).toBeGreaterThanOrEqual(withoutEntity.confidence);
      });
    });

    describe('add-to-cart intent', () => {
      it('detects "add" keyword', () => {
        const result = detectIntent('add rice to cart');
        expect(result.type).toBe('add-to-cart');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('detects "buy" keyword', () => {
        const result = detectIntent('buy 2 packets of dal');
        expect(result.type).toBe('add-to-cart');
      });

      it('detects "get me" keyword', () => {
        const result = detectIntent('get me some bread');
        expect(result.type).toBe('add-to-cart');
      });

      it('detects "add to cart" phrase', () => {
        const result = detectIntent('add to cart milk');
        expect(result.type).toBe('add-to-cart');
      });
    });

    describe('substitute intent', () => {
      it('detects "substitute" keyword', () => {
        const result = detectIntent('substitute for tata salt');
        expect(result.type).toBe('substitute');
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      });

      it('detects "alternative" keyword', () => {
        const result = detectIntent('any alternative to amul butter');
        expect(result.type).toBe('substitute');
      });

      it('detects "instead of" keyword', () => {
        const result = detectIntent('what can I use instead of ghee');
        expect(result.type).toBe('substitute');
      });

      it('detects "similar to" keyword', () => {
        const result = detectIntent('something similar to fortune oil');
        expect(result.type).toBe('substitute');
      });
    });

    describe('greeting intent', () => {
      it('detects "hi"', () => {
        const result = detectIntent('hi');
        expect(result.type).toBe('greeting');
        expect(result.confidence).toBeGreaterThanOrEqual(0.95);
      });

      it('detects "hello"', () => {
        const result = detectIntent('hello');
        expect(result.type).toBe('greeting');
      });

      it('detects "hey"', () => {
        const result = detectIntent('hey!');
        expect(result.type).toBe('greeting');
      });

      it('detects "namaste"', () => {
        const result = detectIntent('namaste');
        expect(result.type).toBe('greeting');
      });

      it('does not match greeting inside a sentence', () => {
        const result = detectIntent('hello can you find me rice');
        // Should match search since greeting needs to be the full message
        expect(result.type).not.toBe('greeting');
      });
    });

    describe('help intent', () => {
      it('detects "help"', () => {
        const result = detectIntent('help');
        expect(result.type).toBe('help');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('detects "what can you do"', () => {
        const result = detectIntent('what can you do');
        expect(result.type).toBe('help');
      });
    });

    describe('onboarding-answer intent', () => {
      it('detects dietary preference statements', () => {
        const result = detectIntent('I am vegetarian');
        expect(result.type).toBe('onboarding-answer');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      });

      it('detects preference statements', () => {
        const result = detectIntent('I prefer organic products');
        expect(result.type).toBe('onboarding-answer');
      });

      it('detects avoidance statements', () => {
        const result = detectIntent("I don't eat dairy");
        expect(result.type).toBe('onboarding-answer');
      });
    });

    describe('unknown intent', () => {
      it('returns unknown for gibberish', () => {
        const result = detectIntent('asdfghjkl');
        expect(result.type).toBe('unknown');
        expect(result.confidence).toBeLessThan(0.5);
      });

      it('returns unknown for empty string', () => {
        const result = detectIntent('');
        expect(result.type).toBe('unknown');
        expect(result.confidence).toBe(0);
      });
    });
  });

  describe('invoke', () => {
    describe('greeting responses', () => {
      it('returns a greeting message', async () => {
        const response = await agent.invoke(context, 'hello');
        expect(response.content).toContain('KiranaAI');
        expect(response.products).toBeUndefined();
      });

      it('contains at most one question', async () => {
        const response = await agent.invoke(context, 'hi');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });
    });

    describe('help responses', () => {
      it('returns help information', async () => {
        const response = await agent.invoke(context, 'what can you do');
        expect(response.content).toContain('help');
        expect(response.content).toContain('products');
      });

      it('contains at most one question', async () => {
        const response = await agent.invoke(context, 'help');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });
    });

    describe('search responses', () => {
      it('returns product cards when searching', async () => {
        const response = await agent.invoke(context, 'find me organic milk');
        expect(response.products).toBeDefined();
        expect(response.products!.length).toBeGreaterThan(0);
      });

      it('product cards have required fields', async () => {
        const response = await agent.invoke(context, 'show me rice');
        const card = response.products![0];
        expect(card.productId).toBeDefined();
        expect(card.name).toBeDefined();
        expect(card.price).toBeGreaterThan(0);
      });

      it('sets action to suggest', async () => {
        const response = await agent.invoke(context, 'search for dal');
        expect(response.action).toBe('suggest');
      });

      it('includes the search query in response content', async () => {
        const response = await agent.invoke(context, 'find me sugar');
        expect(response.content).toContain('sugar');
      });

      it('contains at most one question', async () => {
        const response = await agent.invoke(context, 'show me bread');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });
    });

    describe('add-to-cart responses', () => {
      it('confirms addition when product specified', async () => {
        const response = await agent.invoke(context, 'add rice to cart');
        expect(response.content).toContain('added');
        expect(response.action).toBe('auto-added');
      });

      it('includes product card when adding', async () => {
        const response = await agent.invoke(context, 'buy some bread');
        expect(response.products).toBeDefined();
        expect(response.products!.length).toBeGreaterThan(0);
      });

      it('asks which product when none specified', async () => {
        const response = await agent.invoke(context, 'add to cart');
        expect(response.content).toContain('?');
        expect(response.products).toBeUndefined();
      });

      it('contains at most one question', async () => {
        const response = await agent.invoke(context, 'add to cart');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });
    });

    describe('substitute responses', () => {
      it('suggests alternatives when product specified', async () => {
        const response = await agent.invoke(context, 'substitute for tata salt');
        expect(response.products).toBeDefined();
        expect(response.action).toBe('suggest');
      });

      it('asks which product when none specified', async () => {
        const response = await agent.invoke(context, 'substitute');
        expect(response.content).toContain('?');
        expect(response.products).toBeUndefined();
      });

      it('contains at most one question', async () => {
        const response = await agent.invoke(context, 'find an alternative to ghee');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });
    });

    describe('onboarding-answer responses', () => {
      it('acknowledges the answer and asks follow-up', async () => {
        const response = await agent.invoke(context, 'I am vegetarian');
        expect(response.content).toContain('Thanks');
      });

      it('completes onboarding after enough questions', async () => {
        const contextWithHistory = createContext({
          conversationHistory: [
            { role: 'assistant', content: 'What types of food?', timestamp: 1 },
            { role: 'user', content: 'vegetarian', timestamp: 2 },
            { role: 'assistant', content: 'Any dietary restrictions?', timestamp: 3 },
            { role: 'user', content: 'gluten free', timestamp: 4 },
            { role: 'assistant', content: 'Favorite brands?', timestamp: 5 },
            { role: 'user', content: 'amul', timestamp: 6 },
          ],
        });

        const response = await agent.invoke(contextWithHistory, 'I prefer organic');
        expect(response.content).toContain('preferences');
      });

      it('contains at most one question per turn', async () => {
        const response = await agent.invoke(context, 'I prefer healthy options');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });
    });

    describe('unknown/fallback responses', () => {
      it('returns fallback message for unrecognized input', async () => {
        const response = await agent.invoke(context, 'xyzzy plugh');
        expect(response.content).toContain("didn't quite understand");
      });

      it('contains at most one question', async () => {
        const response = await agent.invoke(context, 'random gibberish here');
        expect(countQuestions(response.content)).toBeLessThanOrEqual(1);
      });

      it('does not include product cards', async () => {
        const response = await agent.invoke(context, 'blahblah');
        expect(response.products).toBeUndefined();
      });
    });

    describe('one-question-per-turn constraint', () => {
      it('never returns more than one question in any response', async () => {
        const messages = [
          'hi',
          'help',
          'find rice',
          'add milk to cart',
          'substitute for ghee',
          'I am vegetarian',
          'something unknown here totally',
        ];

        for (const msg of messages) {
          const response = await agent.invoke(context, msg);
          const questionCount = countQuestions(response.content);
          expect(questionCount).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('product card formatting', () => {
      it('product cards include productId, name, and price', async () => {
        const response = await agent.invoke(context, 'show me organic ghee');
        expect(response.products).toBeDefined();

        for (const card of response.products!) {
          expect(card).toHaveProperty('productId');
          expect(card).toHaveProperty('name');
          expect(card).toHaveProperty('price');
          expect(typeof card.productId).toBe('string');
          expect(typeof card.name).toBe('string');
          expect(typeof card.price).toBe('number');
          expect(card.price).toBeGreaterThan(0);
        }
      });

      it('product card name is capitalized', async () => {
        const response = await agent.invoke(context, 'find me dal');
        const card = response.products![0];
        expect(card.name.charAt(0)).toBe(card.name.charAt(0).toUpperCase());
      });
    });
  });
});
