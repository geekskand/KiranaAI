/**
 * ChatContext — React Context + Provider for managing chat state.
 * Manages messages, cart state, session ID, and WebSocket connection status.
 * Handles optimistic cart updates with error rollback.
 *
 * Requirements: 1.2, 8.1
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useWebSocket,
  type ConnectionStatus,
  type ServerMessage,
  type ProductCard,
} from '../hooks/useWebSocket';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: ProductCard[];
  timestamp: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ChatContextValue {
  /** All chat messages in the current session */
  messages: ChatMessage[];
  /** Current cart items */
  cartItems: CartItem[];
  /** Sum of cart item prices × quantities */
  cartTotal: number;
  /** Session ID for the current session */
  sessionId: string;
  /** WebSocket connection status */
  connectionStatus: ConnectionStatus;
  /** Send a user message to the agent */
  sendMessage: (content: string) => void;
  /** Add a product to cart (optimistic update) */
  addToCart: (productId: string, name?: string, price?: number) => void;
  /** Remove a product from cart (optimistic update) */
  removeFromCart: (productId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function computeCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// ─── Provider Props ──────────────────────────────────────────────────────────

export interface ChatProviderProps {
  children: React.ReactNode;
  /** WebSocket server URL. Default: ws://localhost:3000 */
  wsUrl?: string;
  /** Auth token for WebSocket connection */
  token?: string;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ChatProvider({
  children,
  wsUrl = 'ws://localhost:3000',
  token = '',
}: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [sessionId] = useState<string>(generateSessionId);

  // Track optimistic updates for rollback
  const optimisticRollbackRef = useRef<Map<string, CartItem[]>>(new Map());

  // WebSocket connection
  const {
    status: connectionStatus,
    messages: serverMessages,
    sendMessage: wsSendMessage,
  } = useWebSocket({ url: wsUrl, token });

  // Process incoming server messages
  const processedCountRef = useRef(0);

  useEffect(() => {
    if (serverMessages.length <= processedCountRef.current) return;

    const newMessages = serverMessages.slice(processedCountRef.current);
    processedCountRef.current = serverMessages.length;

    for (const serverMsg of newMessages) {
      handleServerMessage(serverMsg);
    }
  }, [serverMessages]);

  const handleServerMessage = useCallback((serverMsg: ServerMessage) => {
    switch (serverMsg.type) {
      case 'agentResponse': {
        const payload = serverMsg.payload as {
          content: string;
          products?: ProductCard[];
          sessionId: string;
        };
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: payload.content,
          products: payload.products,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        break;
      }

      case 'cartUpdate': {
        const payload = serverMsg.payload as {
          productId: string;
          action: 'added' | 'removed';
          newTotal: number;
          name?: string;
          price?: number;
          quantity?: number;
        };
        // Server confirmed the cart update — clear rollback snapshot
        optimisticRollbackRef.current.delete(payload.productId);

        // If the server sends detailed cart info, use it to reconcile
        if (payload.action === 'added' && payload.name && payload.price) {
          setCartItems((prev) => {
            const existing = prev.find((item) => item.productId === payload.productId);
            if (existing) {
              return prev.map((item) =>
                item.productId === payload.productId
                  ? { ...item, quantity: payload.quantity ?? item.quantity + 1 }
                  : item
              );
            }
            return prev; // Already optimistically added
          });
        }
        break;
      }

      case 'error': {
        const payload = serverMsg.payload as {
          code: string;
          message: string;
          productId?: string;
        };

        // If error is related to a cart operation, rollback
        if (payload.productId && optimisticRollbackRef.current.has(payload.productId)) {
          const rollbackState = optimisticRollbackRef.current.get(payload.productId)!;
          setCartItems(rollbackState);
          optimisticRollbackRef.current.delete(payload.productId);
        }

        // Add error as a system message
        const errorMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: `Error: ${payload.message}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        break;
      }

      default:
        break;
    }
  }, []);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      // Add user message to local state
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Send via WebSocket
      wsSendMessage(sessionId, trimmed);
    },
    [sessionId, wsSendMessage]
  );

  const addToCart = useCallback(
    (productId: string, name?: string, price?: number) => {
      // Save current state for rollback
      setCartItems((prev) => {
        optimisticRollbackRef.current.set(productId, [...prev]);

        const existing = prev.find((item) => item.productId === productId);
        if (existing) {
          return prev.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        // Add new item with provided or placeholder details
        return [
          ...prev,
          {
            productId,
            name: name ?? productId,
            price: price ?? 0,
            quantity: 1,
          },
        ];
      });

      // Send cart update via WebSocket
      wsSendMessage(sessionId, JSON.stringify({
        action: 'update_cart',
        productId,
        cartAction: 'add',
      }));
    },
    [sessionId, wsSendMessage]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      setCartItems((prev) => {
        optimisticRollbackRef.current.set(productId, [...prev]);

        const existing = prev.find((item) => item.productId === productId);
        if (!existing) return prev;

        if (existing.quantity > 1) {
          return prev.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          );
        }
        return prev.filter((item) => item.productId !== productId);
      });

      // Send cart update via WebSocket
      wsSendMessage(sessionId, JSON.stringify({
        action: 'update_cart',
        productId,
        cartAction: 'remove',
      }));
    },
    [sessionId, wsSendMessage]
  );

  // ─── Derived State ───────────────────────────────────────────────────────────

  const cartTotal = useMemo(() => computeCartTotal(cartItems), [cartItems]);

  // ─── Context Value ───────────────────────────────────────────────────────────

  const value: ChatContextValue = useMemo(
    () => ({
      messages,
      cartItems,
      cartTotal,
      sessionId,
      connectionStatus,
      sendMessage,
      addToCart,
      removeFromCart,
    }),
    [messages, cartItems, cartTotal, sessionId, connectionStatus, sendMessage, addToCart, removeFromCart]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useChatContext — access chat state and actions from any child component.
 * Must be used within a ChatProvider.
 */
export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

export { ChatContext };
export default ChatProvider;
