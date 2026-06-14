import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Product } from '../data/catalog';

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface CartTotals {
  subtotal: number;
  deliveryCharge: number;
  tax: number;
  total: number;
  freeDeliveryThreshold: number;
  amountToFreeDelivery: number;
  itemCount: number;
}

interface CartContextValue {
  lines: CartLine[];
  totals: CartTotals;
  addItem: (product: Product) => void;
  decrement: (productId: string) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  quantityOf: (productId: string) => number;
}

const FREE_DELIVERY_THRESHOLD = 199;
const DELIVERY_CHARGE = 29;
const TAX_RATE = 0.05; // 5% GST on the subtotal

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = 'kirana-cart-v1';

function loadInitial(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CartLine[];
  } catch {
    /* ignore */
  }
  return [];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const addItem = useCallback((product: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.productId === product.productId);
      if (existing) {
        return prev.map((l) =>
          l.product.productId === product.productId ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const decrement = useCallback((productId: string) => {
    setLines((prev) =>
      prev
        .map((l) => (l.product.productId === productId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const quantityOf = useCallback(
    (productId: string) => lines.find((l) => l.product.productId === productId)?.quantity ?? 0,
    [lines]
  );

  const totals = useMemo<CartTotals>(() => {
    const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
    const deliveryCharge = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
    const tax = Math.round(subtotal * TAX_RATE);
    const total = subtotal + deliveryCharge + tax;
    return {
      subtotal,
      deliveryCharge,
      tax,
      total,
      freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
      amountToFreeDelivery: Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal),
      itemCount,
    };
  }, [lines]);

  const value = useMemo(
    () => ({ lines, totals, addItem, decrement, removeItem, clear, quantityOf }),
    [lines, totals, addItem, decrement, removeItem, clear, quantityOf]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
