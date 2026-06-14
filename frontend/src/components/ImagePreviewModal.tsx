import { useEffect } from 'react';
import './ImagePreviewModal.css';

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  name: string;
  price: number;
  brand?: string;
  onClose: () => void;
}

/**
 * Modal/drawer-based image preview. Lets users enlarge a product image
 * without navigating away from the chat interface.
 */
export function ImagePreviewModal({ src, alt, name, price, brand, onClose }: ImagePreviewModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="image-preview-backdrop" onClick={onClose} role="presentation">
      <div
        className="image-preview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Image preview: ${name}`}
      >
        <button
          className="image-preview-close"
          onClick={onClose}
          aria-label="Close image preview"
          type="button"
        >
          ✕
        </button>
        <div className="image-preview-imagewrap">
          <img src={src} alt={alt} />
        </div>
        <div className="image-preview-info">
          {brand && <span className="image-preview-brand">{brand}</span>}
          <span className="image-preview-name">{name}</span>
          <span className="image-preview-price">₹{price.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

export default ImagePreviewModal;
