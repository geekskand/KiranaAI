import { useCallback } from 'react';
import './ProductCard.css';

/**
 * ProductCard displays a product recommendation inline within the chat thread.
 * Shows product name, price (₹XX), recommendation reason, and an add-to-cart button.
 *
 * The add-to-cart button triggers an `update_cart` action via WebSocket.
 *
 * Validates: Requirements 1.5, 6.3, 7.3
 */

export interface ProductCardProps {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  /** Reason for recommendation, e.g. "Based on your preferences", "Frequently bought together", "Get free delivery" */
  reason?: string;
  /** Callback to send the update_cart action via WebSocket */
  onAddToCart: (productId: string) => void;
  /** Whether the add-to-cart action is in progress */
  isAdding?: boolean;
}

export function ProductCard({
  productId,
  name,
  price,
  imageUrl,
  reason,
  onAddToCart,
  isAdding = false,
}: ProductCardProps) {
  const handleAddToCart = useCallback(() => {
    if (!isAdding) {
      onAddToCart(productId);
    }
  }, [productId, onAddToCart, isAdding]);

  const formattedPrice = `₹${price.toFixed(0)}`;

  return (
    <div className="product-card" role="article" aria-label={`Product: ${name}`}>
      {imageUrl && (
        <div className="product-card__image">
          <img src={imageUrl} alt={name} loading="lazy" />
        </div>
      )}
      <div className="product-card__info">
        <div className="product-card__header">
          <span className="product-card__name">{name}</span>
          <span className="product-card__price">{formattedPrice}</span>
        </div>
        {reason && (
          <span className="product-card__reason">{reason}</span>
        )}
      </div>
      <button
        className="product-card__add-btn"
        onClick={handleAddToCart}
        disabled={isAdding}
        aria-label={`Add ${name} to cart`}
        type="button"
      >
        {isAdding ? 'Adding...' : '+ Add'}
      </button>
    </div>
  );
}

export default ProductCard;
