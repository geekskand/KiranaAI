/**
 * Unit tests for BedrockAgentProvider.
 * Mocks the Bedrock client to test prompt building, tool dispatch,
 * confidence routing, and one-question-per-turn enforcement.
 *
 * Requirements: 1.2, 1.3, 4.1, 4.2, 4.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BedrockAgentProvider,
  convertToBedrockMessages,
  extractConfidence,
  routeAction,
  extractProductCards,
  enforceOneQuestion,
} from './bedrock.js';
import type { AgentContext, Message } from '../../models/index.js';
import type { ToolDispatcher } from './bedrock.js';

// ─── Mock Bedrock Client ─────────────────────────────────────────────────────

function createMockClient(responses: Array<Record<string, unknown>>) {
  let callIndex = 0;
  return {
    send: vi.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

function makeTextResponse(text: string) {
  return {
    output: {
      message: {
        role: 'assistant',
        content: [{ text }],
      },
    },
    stopReason: 'end_turn',
  };
}

function makeToolUseResponse(
  toolUseId: string,
  name: string,
  input: Record<string, unknown>
) {
  return {
    output: {
      message: {
        role: 'assistant',
        content: [
          { text: '' },
          { toolUse: { toolUseId, name, input } },
        ],
      },
    },
    stopReason: 'tool_use',
  };
}

// ─── Test Context Factory ────────────────────────────────────────────────────

function createTestContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    sessionId: 'session-123',
    userId: 'user-456',
    conversationHistory: [],
    cartState: [],
    ...overrides,
  };
}

// ─── Helper Function Tests ───────────────────────────────────────────────────

describe('convertToBedrockMessages', () => {
  it('converts empty history to empty array', () => {
    expect(convertToBedrockMessages([])).toEqual([]);
  });

  it('converts messages with correct role and content format', () => {
    const history: Message[] = [
      { role: 'user', content: 'Hello', timestamp: 1000 },
      { role: 'assistant', content: 'Hi there!', timestamp: 1001 },
    ];

    const result = convertToBedrockMessages(history);
    expect(result).toEqual([
      { role: 'user', content: [{ text: 'Hello' }] },
      { role: 'assistant', content: [{ text: 'Hi there!' }] },
    ]);
  });

  it('preserves message order', () => {
    const history: Message[] = [
      { role: 'user', content: 'First', timestamp: 1000 },
      { role: 'assistant', content: 'Second', timestamp: 1001 },
      { role: 'user', content: 'Third', timestamp: 1002 },
    ];

    const result = convertToBedrockMessages(history);
    expect(result).toHaveLength(3);
    expect(result[0].content).toEqual([{ text: 'First' }]);
    expect(result[2].content).toEqual([{ text: 'Third' }]);
  });
});

describe('extractConfidence', () => {
  it('extracts confidence from tool output confidence field', () => {
    const result = extractConfidence('some text', [
      { output: { confidence: 0.92 } },
    ]);
    expect(result).toBe(0.92);
  });

  it('extracts confidence from tool output score field', () => {
    const result = extractConfidence('some text', [
      { output: { score: 0.75 } },
    ]);
    expect(result).toBe(0.75);
  });

  it('extracts confidence from response text pattern', () => {
    const result = extractConfidence('confidence: 0.88', []);
    expect(result).toBe(0.88);
  });

  it('extracts confidence_score pattern from text', () => {
    const result = extractConfidence('The confidence score: 0.65 is medium', []);
    expect(result).toBe(0.65);
  });

  it('returns default 0.7 when no confidence found', () => {
    const result = extractConfidence('No confidence info here', []);
    expect(result).toBe(0.7);
  });

  it('ignores out-of-range confidence values in text', () => {
    const result = extractConfidence('confidence: 1.5', []);
    expect(result).toBe(0.7); // Falls back to default
  });

  it('prefers tool output over text pattern', () => {
    const result = extractConfidence('confidence: 0.5', [
      { output: { confidence: 0.9 } },
    ]);
    expect(result).toBe(0.9);
  });
});

describe('routeAction', () => {
  it('returns auto-added for confidence > 0.85', () => {
    expect(routeAction(0.86)).toBe('auto-added');
    expect(routeAction(0.95)).toBe('auto-added');
    expect(routeAction(1.0)).toBe('auto-added');
  });

  it('returns suggest for confidence between 0.55 and 0.85', () => {
    expect(routeAction(0.55)).toBe('suggest');
    expect(routeAction(0.7)).toBe('suggest');
    expect(routeAction(0.85)).toBe('suggest');
  });

  it('returns shortlist for confidence < 0.55', () => {
    expect(routeAction(0.54)).toBe('shortlist');
    expect(routeAction(0.3)).toBe('shortlist');
    expect(routeAction(0.0)).toBe('shortlist');
  });

  it('handles boundary at 0.85 as suggest (not auto-added)', () => {
    expect(routeAction(0.85)).toBe('suggest');
  });

  it('handles boundary at 0.55 as suggest (not shortlist)', () => {
    expect(routeAction(0.55)).toBe('suggest');
  });
});

describe('extractProductCards', () => {
  it('returns empty array when no search_products tools', () => {
    const result = extractProductCards([
      { tool: 'lookup_preference', output: { userId: 'u1' } },
    ]);
    expect(result).toEqual([]);
  });

  it('extracts product cards from search_products output', () => {
    const result = extractProductCards([
      {
        tool: 'search_products',
        output: [
          { productId: 'p1', name: 'Milk', price: 60, imageUrl: 'img.jpg' },
          { productId: 'p2', name: 'Bread', price: 40 },
        ] as unknown as Record<string, unknown>,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      productId: 'p1',
      name: 'Milk',
      price: 60,
      imageUrl: 'img.jpg',
    });
    expect(result[1]).toEqual({
      productId: 'p2',
      name: 'Bread',
      price: 40,
      imageUrl: undefined,
    });
  });

  it('handles empty search results', () => {
    const result = extractProductCards([
      {
        tool: 'search_products',
        output: [] as unknown as Record<string, unknown>,
      },
    ]);
    expect(result).toEqual([]);
  });
});

describe('enforceOneQuestion', () => {
  it('returns text unchanged when no questions', () => {
    const text = 'Here are some products for you.';
    expect(enforceOneQuestion(text)).toBe(text);
  });

  it('returns text unchanged when exactly one question', () => {
    const text = 'Would you like me to add this to your cart?';
    expect(enforceOneQuestion(text)).toBe(text);
  });

  it('removes additional questions after the first', () => {
    const text =
      'Would you like milk? What brand do you prefer? Is 2% okay?';
    const result = enforceOneQuestion(text);
    expect(result).toContain('Would you like milk?');
    expect((result.match(/\?/g) || []).length).toBe(1);
  });

  it('preserves non-question sentences after the first question', () => {
    const text =
      'Would you like milk? I found several options. Which brand do you prefer?';
    const result = enforceOneQuestion(text);
    expect(result).toContain('Would you like milk?');
    expect(result).toContain('I found several options.');
    expect((result.match(/\?/g) || []).length).toBe(1);
  });
});

// ─── BedrockAgentProvider Tests ──────────────────────────────────────────────

describe('BedrockAgentProvider', () => {
  let mockDispatcher: ToolDispatcher;

  beforeEach(() => {
    mockDispatcher = {
      dispatch: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  describe('invoke - basic text response', () => {
    it('returns agent text response for simple message', async () => {
      const mockClient = createMockClient([
        makeTextResponse('Hello! How can I help you today?'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'Hi');

      expect(result.content).toBe('Hello! How can I help you today?');
      expect(result.toolCalls).toBeUndefined();
      expect(result.action).toBeUndefined();
    });

    it('sends system prompt and conversation history to Bedrock', async () => {
      const mockClient = createMockClient([
        makeTextResponse('Sure, I can help with that.'),
      ]);

      const context = createTestContext({
        conversationHistory: [
          { role: 'user', content: 'I need milk', timestamp: 1000 },
          { role: 'assistant', content: 'What brand?', timestamp: 1001 },
        ],
      });

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      await provider.invoke(context, 'Amul please');

      expect(mockClient.send).toHaveBeenCalledTimes(1);
      const callArgs = mockClient.send.mock.calls[0][0].input;
      expect(callArgs.system[0].text).toContain('KiranaAI');
      expect(callArgs.messages).toHaveLength(3); // 2 history + 1 current
      expect(callArgs.messages[2].content[0].text).toBe('Amul please');
    });
  });

  describe('invoke - tool use', () => {
    it('dispatches tool calls and returns results', async () => {
      const searchOutput = [
        { productId: 'p1', name: 'Amul Milk', price: 65 },
      ];

      (mockDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        searchOutput
      );

      const mockClient = createMockClient([
        makeToolUseResponse('tu-1', 'search_products', {
          query: 'amul milk',
        }),
        makeTextResponse(
          'I found Amul Milk for ₹65. confidence: 0.9 Would you like me to add it?'
        ),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'I want amul milk');

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith('search_products', {
        query: 'amul milk',
      });
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].tool).toBe('search_products');
      expect(result.toolCalls![0].output).toEqual(searchOutput);
    });

    it('routes action as auto-added when confidence > 0.85', async () => {
      (mockDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
        confidence: 0.92,
      });

      const mockClient = createMockClient([
        makeToolUseResponse('tu-1', 'lookup_preference', {
          userId: 'user-456',
        }),
        makeTextResponse('Based on your preferences, I added Amul Milk.'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'Get me my usual milk');

      expect(result.action).toBe('auto-added');
    });

    it('routes action as suggest when confidence is medium', async () => {
      (mockDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
        confidence: 0.7,
      });

      const mockClient = createMockClient([
        makeToolUseResponse('tu-1', 'search_products', { query: 'milk' }),
        makeTextResponse('How about Amul Milk?'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'I need some milk');

      expect(result.action).toBe('suggest');
    });

    it('routes action as shortlist when confidence is low', async () => {
      (mockDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
        confidence: 0.4,
      });

      const mockClient = createMockClient([
        makeToolUseResponse('tu-1', 'search_products', { query: 'snacks' }),
        makeTextResponse('Here are some options for you.'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'Show me some snacks');

      expect(result.action).toBe('shortlist');
    });
  });

  describe('invoke - multiple tool calls', () => {
    it('handles sequential tool calls in a loop', async () => {
      const dispatchMock = mockDispatcher.dispatch as ReturnType<typeof vi.fn>;
      dispatchMock
        .mockResolvedValueOnce({ dietaryFlags: ['vegetarian'] })
        .mockResolvedValueOnce([
          { productId: 'p1', name: 'Veggie Chips', price: 30 },
        ]);

      const mockClient = createMockClient([
        // First: lookup preferences
        makeToolUseResponse('tu-1', 'lookup_preference', {
          userId: 'user-456',
        }),
        // Second: search products
        makeToolUseResponse('tu-2', 'search_products', {
          query: 'snacks',
          filters: { dietaryFlags: ['vegetarian'] },
        }),
        // Final text response
        makeTextResponse(
          'I found Veggie Chips that match your vegetarian preference. confidence: 0.8'
        ),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'Find me vegetarian snacks');

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].tool).toBe('lookup_preference');
      expect(result.toolCalls![1].tool).toBe('search_products');
      expect(result.action).toBe('suggest'); // 0.8 is medium
    });
  });

  describe('invoke - one question per turn enforcement', () => {
    it('enforces one question when response has multiple questions', async () => {
      const mockClient = createMockClient([
        makeTextResponse(
          'Would you like organic milk? What brand do you prefer? Should I check prices?'
        ),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'I need milk');

      const questionCount = (result.content.match(/\?/g) || []).length;
      expect(questionCount).toBeLessThanOrEqual(1);
    });
  });

  describe('invoke - no action without tool calls', () => {
    it('does not set action when no tools are called', async () => {
      const mockClient = createMockClient([
        makeTextResponse('Hello! I am KiranaAI, your shopping assistant.'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'Hello');

      expect(result.action).toBeUndefined();
      expect(result.toolCalls).toBeUndefined();
    });
  });

  describe('invoke - product card extraction', () => {
    it('includes product cards from search results', async () => {
      const products = [
        { productId: 'p1', name: 'Amul Milk', price: 65, imageUrl: 'img1.jpg' },
        { productId: 'p2', name: 'Mother Dairy Milk', price: 62 },
      ];

      (mockDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        products
      );

      const mockClient = createMockClient([
        makeToolUseResponse('tu-1', 'search_products', { query: 'milk' }),
        makeTextResponse('Here are milk options. confidence: 0.6'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext();
      const result = await provider.invoke(context, 'Show me milk options');

      expect(result.products).toHaveLength(2);
      expect(result.products![0].name).toBe('Amul Milk');
      expect(result.products![1].name).toBe('Mother Dairy Milk');
    });
  });

  describe('invoke - cart state in context', () => {
    it('sends update_cart tool with session info', async () => {
      (mockDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        cartTotal: 125,
      });

      const mockClient = createMockClient([
        makeToolUseResponse('tu-1', 'update_cart', {
          sessionId: 'session-123',
          productId: 'p1',
          action: 'add',
        }),
        makeTextResponse('Done! I added Amul Milk to your cart. confidence: 0.95'),
      ]);

      const provider = new BedrockAgentProvider({
        client: mockClient as unknown as any,
        toolDispatcher: mockDispatcher,
      });

      const context = createTestContext({
        cartState: [{ productId: 'p0', name: 'Bread', price: 40, quantity: 1 }],
      });

      const result = await provider.invoke(context, 'Add amul milk');

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith('update_cart', {
        sessionId: 'session-123',
        productId: 'p1',
        action: 'add',
      });
      expect(result.action).toBe('auto-added');
    });
  });
});
