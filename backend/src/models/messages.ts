/**
 * WebSocket message protocol types for KiranaAI.
 * Defines the client-server message contract over WebSocket connections.
 * Requirements: 2.1
 */

import type { ProductCard } from './types.js';

// ─── Client → Server Messages ────────────────────────────────────────────────

export interface ClientMessage {
  action: 'sendMessage';
  payload: {
    sessionId: string;
    content: string;
    timestamp: number;
  };
}

// ─── Server → Client Messages ────────────────────────────────────────────────

export type ServerMessageType = 'agentResponse' | 'productCard' | 'cartUpdate' | 'error';

export interface AgentResponsePayload {
  content: string;
  products?: ProductCard[];
  action?: 'auto-added' | 'suggest' | 'shortlist';
  sessionId: string;
}

export interface ProductCardPayload {
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
  | ProductCardPayload
  | CartUpdatePayload
  | ErrorPayload;

export interface ServerMessage {
  type: ServerMessageType;
  payload: ServerMessagePayload;
}
