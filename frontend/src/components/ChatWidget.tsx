import React, { useRef, useEffect, useState } from 'react';
import './ChatWidget.css';
import { useChatContext } from '../context/ChatContext';
import { ProductCard } from './ProductCard';

/**
 * ChatWidget renders as a floating overlay panel (bottom-right corner)
 * on the commerce UI without obstructing product browsing.
 *
 * Now wired to ChatContext + WebSocket for real agent communication.
 *
 * Validates: Requirement 1.1, 1.2
 */
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    connectionStatus,
    sendMessage,
    addToCart,
    cartItems,
    cartTotal,
  } = useChatContext();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddToCart = (productId: string) => {
    // Find product info from messages
    for (const msg of messages) {
      if (msg.products) {
        const product = msg.products.find((p) => p.productId === productId);
        if (product) {
          addToCart(productId, product.name, product.price);
          return;
        }
      }
    }
    addToCart(productId);
  };

  const statusIndicator = connectionStatus === 'connected'
    ? '🟢'
    : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
    ? '🟡'
    : '🔴';

  return (
    <>
      {/* Chat overlay panel */}
      {isOpen && (
        <div className="chat-widget-overlay" role="dialog" aria-label="Chat with KiranaAI">
          {/* Header */}
          <div className="chat-widget-header">
            <span className="chat-widget-title">
              {statusIndicator} KiranaAI
            </span>
            {cartItems.length > 0 && (
              <span className="chat-widget-cart-badge">
                🛒 ₹{cartTotal}
              </span>
            )}
            <button
              className="chat-widget-close-btn"
              onClick={handleToggle}
              aria-label="Close chat"
              type="button"
            >
              ✕
            </button>
          </div>

          {/* Message list */}
          <div className="chat-widget-messages" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-widget-empty">
                <p>Hi! I'm your KiranaAI shopping assistant.</p>
                <p>How can I help you today?</p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-widget-message chat-widget-message--${msg.role}`}
              >
                <div className="chat-widget-message-content">{msg.content}</div>
                {/* Render product cards if present */}
                {msg.products && msg.products.length > 0 && (
                  <div className="chat-widget-products">
                    {msg.products.map((product) => (
                      <ProductCard
                        key={product.productId}
                        productId={product.productId}
                        name={product.name}
                        price={product.price}
                        imageUrl={product.imageUrl}
                        reason={product.reason}
                        onAddToCart={handleAddToCart}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="chat-widget-input-area">
            <input
              ref={inputRef}
              type="text"
              className="chat-widget-input"
              placeholder={connectionStatus === 'connected' ? 'Type a message...' : 'Connecting...'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={connectionStatus !== 'connected'}
              aria-label="Message input"
            />
            <button
              className="chat-widget-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim() || connectionStatus !== 'connected'}
              aria-label="Send message"
              type="button"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) toggle */}
      <button
        className="chat-widget-fab"
        onClick={handleToggle}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        type="button"
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </>
  );
}

export default ChatWidget;
