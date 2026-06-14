import { useState } from 'react';
import type { Product } from '../data/catalog';
import { categoryIcon, categoryLabel } from '../data/catalog';
import { useCart } from '../store/CartContext';
import './ProductTile.css';

/** SVG placeholder shown if the product image fails to load. */
function placeholder(category: string): string {
  const icon = categoryIcon(category);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f1f5f9"/><text x="100" y="100" font-size="84" text-anchor="middle" dominant-baseline="central">${icon}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function ProductTile({ product }: { product: Product }) {
  const { quantityOf, addItem, decrement } = useCart();
  const qty = quantityOf(product.productId);
  const [src, setSrc] = useState(product.imageUrl || placeholder(product.category));

  return (
    <div className="tile">
      <div className="tile__imgwrap">
        <img
          className="tile__img"
          src={src}
          alt={product.name}
          loading="lazy"
          onError={() => setSrc(placeholder(product.category))}
        />
        {!product.inStock && <span className="tile__oos">Out of stock</span>}
        {product.isOrganic && <span className="tile__badge tile__badge--organic">Organic</span>}
      </div>

      <div className="tile__body">
        <span className="tile__brand">{product.brand}</span>
        <span className="tile__name">{product.name}</span>
        <span className="tile__cat">{categoryLabel(product.category)}</span>
        <div className="tile__row">
          <span className="tile__price">₹{product.price}</span>
          {qty === 0 ? (
            <button
              className="tile__add"
              disabled={!product.inStock}
              onClick={() => addItem(product)}
            >
              ADD
            </button>
          ) : (
            <div className="tile__stepper">
              <button onClick={() => decrement(product.productId)} aria-label="Decrease">−</button>
              <span>{qty}</span>
              <button onClick={() => addItem(product)} aria-label="Increase">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductTile;
