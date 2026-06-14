import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnStatus = 'connecting' | 'connected' | 'disconnected';

export interface AssistantProduct {
  productId: string;
  name: string;
  price: number;
  brand?: string;
  category?: string;
  imageUrl?: string;
  reason?: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: AssistantProduct[];
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

function uid() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Connects to the KiranaAI Intent Engine over WebSocket and exposes a simple
 * send/receive chat interface for the Home assistant.
 */
export function useKiranaSocket(persona: string) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef(`web-${Date.now()}`);

  const connect = useCallback(() => {
    setStatus('connecting');
    const url = `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(persona)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'agentResponse') {
          setThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'assistant',
              content: msg.payload.content,
              products: msg.payload.products,
            },
          ]);
        } else if (msg.type === 'error') {
          setThinking(false);
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: 'assistant', content: msg.payload.message || 'Something went wrong.' },
          ]);
        }
      } catch {
        /* ignore */
      }
    };
  }, [persona]);

  // Reconnect and reset the conversation whenever the persona changes,
  // so one persona's chat never bleeds into another's.
  useEffect(() => {
    setMessages([]);
    setThinking(false);
    sessionRef.current = `web-${persona}-${Date.now()}`;
    connect();
    return () => wsRef.current?.close();
  }, [connect, persona]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: uid(), role: 'user', content: trimmed }]);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      setThinking(true);
      ws.send(
        JSON.stringify({
          action: 'sendMessage',
          payload: { sessionId: sessionRef.current, userId: persona, content: trimmed, timestamp: Date.now() },
        })
      );
    } else {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'assistant', content: 'Assistant is offline right now. Try the Store tab to browse products.' },
      ]);
    }
  }, [persona]);

  return { status, messages, thinking, send };
}
