import { useCallback, useState } from 'react';
import './ProductCard.css';
import { buildPlaceholderDataUri } from '../utils/productImages';
import { ImagePreviewModal } from './ImagePreviewModal';

/**
 * ProductCard displays a product recommendation inline within the chat thread.
 * Shows a product image (with graceful fallback), name, brand, price, optional
 * discount, an AI recommendation reason, and actions (Add / Compare / Details).
 *
 * The recommendation flow never breaks if an image is missing — a clean
 * category-based placeholder is shown instead.
 *
 * Validates: Requirements 1.5, 6.3, 7.3
 */

export interface ProductCardProps {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  brand?: string;
  category?: string;
  /** Original price before discount, used to compute the discount badge. */
  originalPrice?: number;
  /** Reason for recommendation, e.g. "Most budget-conscious shoppers choose this." */
  reason?: string;
  /** Callback to send the update_cart action via WebSocket */
  onAddToCart: (productId: string) => void;
  /** Optional compare handler */
  onCompare?: (productId: string) => void;
  /** Optional details handler */
  onDetails?: (productId: string) => void;
  /** Whether the add-to-cart action is in progress */
  isAdding?: boolean;
}

export function ProductCard({
  productId,
  name,
  price,
  imageUrl,
  brand,
  category,
  originalPrice,
  reason,
  onAddToCart,
  onCompare,
  onDetails,
  isAdding = false,
}: ProductCardProps) {
  const placeholder = buildPlaceholderDataUri(category, name);
  const [imgSrc, setImgSrc] = useState(imageUrl || placeholder);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleAddToCart = useCallback(() => {
    if (!isAdding) onAddToCart(productId);
  }, [productId, onAddToCart, isAdding]);

  const handleImageError = useCallback(() => {
    // Graceful fallback to category placeholder
    if (imgSrc !== placeholder) setImgSrc(placeholder);
  }, [imgSrc, placeholder]);

  const formattedPrice = `₹${price.toFixed(0)}`;
  const discountPct =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  return (
    <>
      <div className="product-card" role="article" aria-label={`Product: ${name}`}>
        {/* Image */}
        <button
          className="product-card__image"
          onClick={() => setPreviewOpen(true)}
          aria-label={`Enlarge image of ${name}`}
          type="button"
        >
          <img
            src={imgSrc}
            alt={name}
            loading="lazy"
            onError={handleImageError}
          />
          {discountPct > 0 && (
            <span className="product-card__discount">{discountPct}% OFF</span>
          )}
        </button>

        {/* Info */}
        <div className="product-card__info">
          {brand && <span className="product-card__brand">{brand}</span>}
          <span className="product-card__name">{name}</span>
          <div className="product-card__pricing">
            <span className="product-card__price">{formattedPrice}</span>
            {discountPct > 0 && originalPrice && (
              <span className="product-card__original-price">₹{originalPrice.toFixed(0)}</span>
            )}
          </div>
          {reason && <span className="product-card__reason">{reason}</span>}

          {/* Actions */}
          <div className="product-card__actions">
            <button
              className="product-card__btn product-card__btn--primary"
              onClick={handleAddToCart}
              disabled={isAdding}
              aria-label={`Add ${name} to cart`}
              type="button"
            >
              {isAdding ? 'Adding…' : '+ Add'}
            </button>
            {onCompare && (
              <button
                className="product-card__btn product-card__btn--ghost"
                onClick={() => onCompare(productId)}
                aria-label={`Compare ${name}`}
                type="button"
              >
                Compare
              </button>
            )}
            <button
              className="product-card__btn product-card__btn--ghost"
              onClick={() => (onDetails ? onDetails(productId) : setPreviewOpen(true))}
              aria-label={`View details for ${name}`}
              type="button"
            >
              Details
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <ImagePreviewModal
          src={imgSrc}
          alt={name}
          name={name}
          price={price}
          brand={brand}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

export default ProductCard;
