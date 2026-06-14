/**
 * Tests for ChatContext — verifying state management for messages,
 * cart, session, and WebSocket message handling.
 *
 * Validates: Requirements 1.2, 8.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ChatProvider, useChatContext } from './ChatContext';

// Mock the useWebSocket hook
const mockSendMessage = vi.fn();
let mockStatus: string = 'connected';
let mockMessages: any[] = [];

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    status: mockStatus,
    messages: mockMessages,
    sendMessage: mockSendMessage,
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  }),
}));

// Test component that exposes context values
function TestConsumer({ onRender }: { onRender: (ctx: any) => void }) {
  const ctx = useChatContext();
  onRender(ctx);
  return (
    <div>
      <span data-testid="session-id">{ctx.sessionId}</span>
      <span data-testid="connection-status">{ctx.connectionStatus}</span>
      <span data-testid="message-count">{ctx.messages.length}</span>
      <span data-testid="cart-total">{ctx.cartTotal}</span>
      <span data-testid="cart-count">{ctx.cartItems.length}</span>
    </div>
  );
}

describe('ChatContext', () => {
  let latestCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus = 'connected';
    mockMessages = [];
    latestCtx = null;
  });

  function renderWithProvider() {
    return render(
      <ChatProvider wsUrl="ws://test:3000" token="test-token">
        <TestConsumer onRender={(ctx) => { latestCtx = ctx; }} />
      </ChatProvider>
    );
  }

  describe('Initialization', () => {
    it('generates a session ID on mount', () => {
      renderWithProvider();
      expect(latestCtx.sessionId).toBeTruthy();
      expect(latestCtx.sessionId).toMatch(/^session-/);
    });

    it('starts with empty messages', () => {
      renderWithProvider();
      expect(latestCtx.messages).toEqual([]);
    });

    it('starts with empty cart', () => {
      renderWithProvider();
      expect(latestCtx.cartItems).toEqual([]);
      expect(latestCtx.cartTotal).toBe(0);
    });

    it('exposes connection status from WebSocket hook', () => {
      renderWithProvider();
      expect(latestCtx.connectionStatus).toBe('connected');
    });
  });

  describe('sendMessage', () => {
    it('adds user message to messages array', () => {
      renderWithProvider();

      act(() => {
        latestCtx.sendMessage('Hello, KiranaAI!');
      });

      expect(latestCtx.messages).toHaveLength(1);
      expect(latestCtx.messages[0].role).toBe('user');
      expect(latestCtx.messages[0].content).toBe('Hello, KiranaAI!');
      expect(latestCtx.messages[0].id).toMatch(/^msg-/);
      expect(latestCtx.messages[0].timestamp).toBeGreaterThan(0);
    });

    it('sends message via WebSocket with session ID', () => {
      renderWithProvider();

      act(() => {
        latestCtx.sendMessage('Find me organic milk');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        latestCtx.sessionId,
        'Find me organic milk'
      );
    });

    it('trims whitespace from messages', () => {
      renderWithProvider();

      act(() => {
        latestCtx.sendMessage('  hello  ');
      });

      expect(latestCtx.messages[0].content).toBe('hello');
    });

    it('ignores empty messages', () => {
      renderWithProvider();

      act(() => {
        latestCtx.sendMessage('   ');
      });

      expect(latestCtx.messages).toHaveLength(0);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('addToCart', () => {
    it('optimistically adds item to cart', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Organic Milk', 65);
      });

      expect(latestCtx.cartItems).toHaveLength(1);
      expect(latestCtx.cartItems[0]).toEqual({
        productId: 'prod-1',
        name: 'Organic Milk',
        price: 65,
        quantity: 1,
      });
    });

    it('increments quantity for existing item', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Organic Milk', 65);
      });
      act(() => {
        latestCtx.addToCart('prod-1', 'Organic Milk', 65);
      });

      expect(latestCtx.cartItems).toHaveLength(1);
      expect(latestCtx.cartItems[0].quantity).toBe(2);
    });

    it('computes cart total correctly', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });
      act(() => {
        latestCtx.addToCart('prod-2', 'Bread', 40);
      });

      expect(latestCtx.cartTotal).toBe(105);
    });

    it('sends update_cart via WebSocket', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        latestCtx.sessionId,
        expect.stringContaining('update_cart')
      );
    });
  });

  describe('removeFromCart', () => {
    it('decrements quantity when > 1', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });
      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });
      act(() => {
        latestCtx.removeFromCart('prod-1');
      });

      expect(latestCtx.cartItems).toHaveLength(1);
      expect(latestCtx.cartItems[0].quantity).toBe(1);
    });

    it('removes item entirely when quantity is 1', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });
      act(() => {
        latestCtx.removeFromCart('prod-1');
      });

      expect(latestCtx.cartItems).toHaveLength(0);
      expect(latestCtx.cartTotal).toBe(0);
    });

    it('does nothing for non-existent product', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });
      act(() => {
        latestCtx.removeFromCart('prod-999');
      });

      expect(latestCtx.cartItems).toHaveLength(1);
    });

    it('sends update_cart remove via WebSocket', () => {
      renderWithProvider();

      act(() => {
        latestCtx.addToCart('prod-1', 'Milk', 65);
      });

      mockSendMessage.mockClear();

      act(() => {
        latestCtx.removeFromCart('prod-1');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        latestCtx.sessionId,
        expect.stringContaining('remove')
      );
    });
  });

  describe('Server message handling', () => {
    it('adds assistant message on agentResponse', () => {
      mockMessages = [
        {
          type: 'agentResponse',
          payload: {
            content: 'Here are some options for you!',
            products: [{ productId: 'p1', name: 'Milk', price: 65 }],
            sessionId: 'test-session',
          },
        },
      ];

      renderWithProvider();

      expect(latestCtx.messages).toHaveLength(1);
      expect(latestCtx.messages[0].role).toBe('assistant');
      expect(latestCtx.messages[0].content).toBe('Here are some options for you!');
      expect(latestCtx.messages[0].products).toHaveLength(1);
    });

    it('handles error message and displays it', () => {
      mockMessages = [
        {
          type: 'error',
          payload: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong',
          },
        },
      ];

      renderWithProvider();

      expect(latestCtx.messages).toHaveLength(1);
      expect(latestCtx.messages[0].content).toContain('Something went wrong');
    });
  });

  describe('useChatContext outside provider', () => {
    it('throws error when used outside ChatProvider', () => {
      // Suppress console.error for this test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        function BadComponent() {
          useChatContext();
          return null;
        }
        render(<BadComponent />);
      }).toThrow('useChatContext must be used within a ChatProvider');

      spy.mockRestore();
    });
  });
});
