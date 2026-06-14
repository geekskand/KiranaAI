/**
 * Unit tests for useWebSocket hook.
 * Validates: Requirements 1.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';
import type { ServerMessage } from './useWebSocket';

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: ServerMessage) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.useFakeTimers();
    // Replace global WebSocket with our mock
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const defaultOptions = {
    url: 'wss://example.com/ws',
    token: 'test-token-123',
  };

  it('should start with connecting status and create WebSocket on mount', () => {
    renderHook(() => useWebSocket(defaultOptions));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(
      'wss://example.com/ws?token=test-token-123'
    );
  });

  it('should transition to connected when WebSocket opens', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    expect(result.current.status).toBe('connecting');

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.status).toBe('connected');
  });

  it('should parse incoming ServerMessage and add to messages array', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    const serverMsg: ServerMessage = {
      type: 'agentResponse',
      payload: {
        content: 'Hello! How can I help?',
        sessionId: 'session-1',
      },
    };

    act(() => {
      MockWebSocket.instances[0].simulateMessage(serverMsg);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual(serverMsg);
  });

  it('should ignore malformed messages', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Send invalid JSON
    act(() => {
      if (MockWebSocket.instances[0].onmessage) {
        MockWebSocket.instances[0].onmessage(
          new MessageEvent('message', { data: 'not json' })
        );
      }
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('should send ClientMessage in correct format', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      result.current.sendMessage('session-1', 'I want organic milk');
    });

    expect(MockWebSocket.instances[0].sent).toHaveLength(1);
    const sent = JSON.parse(MockWebSocket.instances[0].sent[0]);
    expect(sent.action).toBe('sendMessage');
    expect(sent.payload.sessionId).toBe('session-1');
    expect(sent.payload.content).toBe('I want organic milk');
    expect(typeof sent.payload.timestamp).toBe('number');
  });

  it('should not send messages when not connected', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    // Still in connecting state (no simulateOpen)
    act(() => {
      result.current.sendMessage('session-1', 'test');
    });

    expect(MockWebSocket.instances[0].sent).toHaveLength(0);
  });

  it('should attempt reconnection with exponential backoff on close', () => {
    const { result } = renderHook(() =>
      useWebSocket({ ...defaultOptions, baseReconnectDelay: 1000 })
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Simulate disconnect
    act(() => {
      MockWebSocket.instances[0].close();
    });

    expect(result.current.status).toBe('reconnecting');

    // After 1000ms (first backoff), a new WebSocket should be created
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('should apply exponential backoff on consecutive failures', () => {
    renderHook(() =>
      useWebSocket({
        ...defaultOptions,
        baseReconnectDelay: 1000,
        maxReconnectAttempts: 3,
      })
    );

    // First close triggers reconnect
    act(() => {
      MockWebSocket.instances[0].close();
    });

    // First attempt after 1000ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second close triggers reconnect with 2000ms delay
    act(() => {
      MockWebSocket.instances[1].close();
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(MockWebSocket.instances).toHaveLength(2); // Not yet

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(3); // Now
  });

  it('should stop reconnecting after maxReconnectAttempts', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        ...defaultOptions,
        baseReconnectDelay: 100,
        maxReconnectAttempts: 2,
      })
    );

    // First close
    act(() => {
      MockWebSocket.instances[0].close();
    });

    // First reconnect at 100ms
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Second close
    act(() => {
      MockWebSocket.instances[1].close();
    });

    // Second reconnect at 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Third close — should give up
    act(() => {
      MockWebSocket.instances[2].close();
    });

    expect(result.current.status).toBe('disconnected');

    // No more reconnects
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('should clean up WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    unmount();

    // WebSocket should be closed
    expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.CLOSED);
  });

  it('should disconnect manually and not reconnect', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe('disconnected');

    // Should not attempt reconnect
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('should reconnect manually after disconnect', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      result.current.disconnect();
    });

    act(() => {
      result.current.reconnect();
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(result.current.status).toBe('connecting');
  });

  it('should reset reconnect attempts on successful connection', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        ...defaultOptions,
        baseReconnectDelay: 100,
        maxReconnectAttempts: 3,
      })
    );

    // Close and reconnect once
    act(() => {
      MockWebSocket.instances[0].close();
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Successfully connect
    act(() => {
      MockWebSocket.instances[1].simulateOpen();
    });

    expect(result.current.status).toBe('connected');

    // Close again — should restart backoff from 0
    act(() => {
      MockWebSocket.instances[1].close();
    });

    // Should reconnect after base delay (100ms), not doubled
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('should handle multiple message types', () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    const messages: ServerMessage[] = [
      {
        type: 'agentResponse',
        payload: { content: 'Here are some options', sessionId: 's1' },
      },
      {
        type: 'productCard',
        payload: { productId: 'p1', name: 'Organic Milk', price: 65, reason: 'Based on your preferences' },
      },
      {
        type: 'cartUpdate',
        payload: { productId: 'p1', action: 'added', newTotal: 265 },
      },
      {
        type: 'error',
        payload: { code: 'SESSION_EXPIRED', message: 'Session has expired' },
      },
    ];

    act(() => {
      messages.forEach((msg) => MockWebSocket.instances[0].simulateMessage(msg));
    });

    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[0].type).toBe('agentResponse');
    expect(result.current.messages[1].type).toBe('productCard');
    expect(result.current.messages[2].type).toBe('cartUpdate');
    expect(result.current.messages[3].type).toBe('error');
  });

  it('should include token in WebSocket URL as query parameter', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://api.example.com/ws?stage=prod', token: 'my-jwt' })
    );

    // Should use & since URL already has query params
    expect(MockWebSocket.instances[0].url).toBe(
      'wss://api.example.com/ws?stage=prod&token=my-jwt'
    );
  });
});
