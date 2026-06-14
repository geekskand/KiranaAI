/**
 * useWebSocket — Custom React hook for managing WebSocket connections.
 * Handles connection lifecycle, auto-reconnect with exponential backoff,
 * ClientMessage sending, and ServerMessage parsing.
 *
 * Requirements: 1.2 — Transmit messages to the Conversational_Agent and display responses.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types mirroring backend protocol ────────────────────────────────────────

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface ClientMessage {
  action: 'sendMessage';
  payload: {
    sessionId: string;
    content: string;
    timestamp: number;
  };
}

export type ServerMessageType = 'agentResponse' | 'productCard' | 'cartUpdate' | 'error';

export interface AgentResponsePayload {
  content: string;
  products?: ProductCard[];
  action?: 'auto-added' | 'suggest' | 'shortlist';
  sessionId: string;
}

export interface ProductCard {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  reason?: string;
}

export interface CartUpdatePayload {
  productId: string;
  action: 'added' | 'removed';
  newTotal: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export type ServerMessagePayload =
  | AgentResponsePayload
  | ProductCard
  | CartUpdatePayload
  | ErrorPayload;

export interface ServerMessage {
  type: ServerMessageType;
  payload: ServerMessagePayload;
}

// ─── Hook Options ────────────────────────────────────────────────────────────

export interface UseWebSocketOptions {
  /** WebSocket server URL (ws:// or wss://) */
  url: string;
  /** Auth token appended as query param or sent in protocol header */
  token: string;
  /** Maximum reconnection attempts before giving up. Default: 5 */
  maxReconnectAttempts?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseReconnectDelay?: number;
}

export interface UseWebSocketReturn {
  /** Current connection status */
  status: ConnectionStatus;
  /** Messages received from the server */
  messages: ServerMessage[];
  /** Send a message to the server */
  sendMessage: (sessionId: string, content: string) => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Manually reconnect */
  reconnect: () => void;
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    token,
    maxReconnectAttempts = 5,
    baseReconnectDelay = 1000,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<ServerMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  // Stable refs for options to avoid re-triggering effects
  const urlRef = useRef(url);
  const tokenRef = useRef(token);
  urlRef.current = url;
  tokenRef.current = token;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    clearReconnectTimer();
    setStatus('connecting');

    // Append token as query parameter for auth
    const separator = urlRef.current.includes('?') ? '&' : '?';
    const wsUrl = `${urlRef.current}${separator}token=${encodeURIComponent(tokenRef.current)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as ServerMessage;
        // Validate message structure
        if (data && typeof data.type === 'string' && data.payload !== undefined) {
          setMessages((prev) => [...prev, data]);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;

      if (shouldReconnectRef.current) {
        scheduleReconnect();
      } else {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // Error events are always followed by close events in browsers,
      // so reconnect logic is handled in onclose.
    };
  }, [clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setStatus('disconnected');
      return;
    }

    setStatus('reconnecting');
    const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
    reconnectAttemptsRef.current += 1;

    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [maxReconnectAttempts, baseReconnectDelay, connect]);

  const sendMessage = useCallback((sessionId: string, content: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message: ClientMessage = {
        action: 'sendMessage',
        payload: {
          sessionId,
          content,
          timestamp: Date.now(),
        },
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [clearReconnectTimer]);

  const reconnect = useCallback(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearReconnectTimer]);

  return {
    status,
    messages,
    sendMessage,
    disconnect,
    reconnect,
  };
}
