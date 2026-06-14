import type { View } from '../components/Navbar';
import { useCart } from '../store/CartContext';
import { categoryIcon } from '../data/catalog';
import { useState } from 'react';
import './Cart.css';

function Thumb({ src, category, name }: { src?: string; category: string; name: string }) {
  const ph = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f1f5f9"/><text x="32" y="32" font-size="30" text-anchor="middle" dominant-baseline="central">${categoryIcon(category)}</text></svg>`
  )}`;
  const [s, setS] = useState(src || ph);
  return <img className="cartline__img" src={s} alt={name} loading="lazy" onError={() => setS(ph)} />;
}

export function Cart({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { lines, totals, addItem, decrement, removeItem } = useCart();

  if (lines.length === 0) {
    return (
      <div className="cart cart--empty">
        <div className="cart__emptybox">
          <span>🛍️</span>
          <h2>Your cart is empty</h2>
          <p>Add products from the store to get started.</p>
          <button className="btn btn--primary" onClick={() => onNavigate('store')}>
            Browse Store
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cart">
      <div className="cart__items">
        <h2>Your Cart ({totals.itemCount} items)</h2>

        {totals.amountToFreeDelivery > 0 ? (
          <div className="cart__freebar">
            Add ₹{totals.amountToFreeDelivery} more for <b>FREE delivery</b>
            <div className="cart__progress">
              <div
                style={{ width: `${Math.min(100, (totals.subtotal / totals.freeDeliveryThreshold) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="cart__freebar cart__freebar--unlocked">🎉 You've unlocked FREE delivery!</div>
        )}

        {lines.map((l) => (
          <div className="cartline" key={l.product.productId}>
            <Thumb src={l.product.imageUrl} category={l.product.category} name={l.product.name} />
            <div className="cartline__info">
              <span className="cartline__brand">{l.product.brand}</span>
              <span className="cartline__name">{l.product.name}</span>
              <span className="cartline__price">₹{l.product.price}</span>
            </div>
            <div className="cartline__controls">
              <div className="cartline__stepper">
                <button onClick={() => decrement(l.product.productId)} aria-label="Decrease">−</button>
                <span>{l.quantity}</span>
                <button onClick={() => addItem(l.product)} aria-label="Increase">+</button>
              </div>
              <span className="cartline__total">₹{l.product.price * l.quantity}</span>
              <button className="cartline__remove" onClick={() => removeItem(l.product.productId)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <aside className="cart__summary">
        <h3>Bill Details</h3>
        <div className="cart__row">
          <span>Item total</span>
          <span>₹{totals.subtotal}</span>
        </div>
        <div className="cart__row">
          <span>Delivery charge</span>
          <span>{totals.deliveryCharge === 0 ? <em className="free">FREE</em> : `₹${totals.deliveryCharge}`}</span>
        </div>
        <div className="cart__row">
          <span>Taxes &amp; charges (5%)</span>
          <span>₹{totals.tax}</span>
        </div>
        <div className="cart__row cart__row--total">
          <span>To Pay</span>
          <span>₹{totals.total}</span>
        </div>
        <button className="btn btn--primary cart__checkout" onClick={() => onNavigate('checkout')}>
          Proceed to Checkout
        </button>
      </aside>
    </div>
  );
}

export default Cart;
