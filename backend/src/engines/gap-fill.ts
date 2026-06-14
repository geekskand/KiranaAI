/**
 * Gap-Fill Engine for KiranaAI.
 *
 * Suggests a product to help the user reach the free delivery threshold.
 * Rules:
 *   - Default free delivery threshold: ₹499
 *   - Max 1 gap-fill suggestion per session
 *   - Select product closest to (but >= the gap) to minimize overshoot
 *   - Don't suggest items already in cart
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import type { CartItem, Product, ProductSuggestion, SessionContext } from '../models/index.js';

/** Default free delivery threshold in INR */
export const DEFAULT_FREE_DELIVERY_THRESHOLD = 499;

export interface GapFillResult {
  suggestion: ProductSuggestion | null;
  cartTotal: number;
  threshold: number;
  gap: number;
}

/**
 * Calculate the total value of a cart.
 */
export function calculateCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Get a gap-fill product suggestion for the current cart.
 *
 * Selects the product whose price is closest to (but >= the gap),
 * minimizing overshoot. If no product exactly fills the gap,
 * selects the cheapest product that gets closest to threshold.
 *
 * @param cart - Current cart items
 * @param sessionContext - Session context with suggestion tracking
 * @param catalog - Available products to suggest from
 * @param threshold - Free delivery threshold (defaults to ₹499)
 * @returns GapFillResult with suggestion and gap metadata
 */
export function getGapFillSuggestion(
  cart: CartItem[],
  sessionContext: SessionContext,
  catalog: Product[],
  threshold: number = DEFAULT_FREE_DELIVERY_THRESHOLD
): GapFillResult {
  const cartTotal = calculateCartTotal(cart);
  const gap = threshold - cartTotal;

  const baseResult: GapFillResult = {
    suggestion: null,
    cartTotal,
    threshold,
    gap: Math.max(0, gap),
  };

  // If cart is already at or above threshold, no suggestion needed
  if (cartTotal >= threshold) {
    return { ...baseResult, gap: 0 };
  }

  // Enforce max 1 gap-fill suggestion per session
  if (sessionContext.suggestionsGiven.gapFill >= 1) {
    return baseResult;
  }

  // Get product IDs already in cart to exclude them
  const cartProductIds = new Set(cart.map((item) => item.productId));

  // Filter catalog: exclude items already in cart
  const eligibleProducts = catalog.filter(
    (product) => !cartProductIds.has(product.productId)
  );

  if (eligibleProducts.length === 0) {
    return baseResult;
  }

  // Strategy: Find the product whose price is closest to the gap (but >= gap)
  // This fills the gap with minimal overshoot.
  // If no product fills the gap exactly, pick the cheapest product that gets closest to threshold.

  // Products that can fill the gap (price >= gap)
  const gapFillers = eligibleProducts.filter((p) => p.price >= gap);

  let selectedProduct: Product | null = null;

  if (gapFillers.length > 0) {
    // Pick the one with minimum overshoot (price closest to gap from above)
    gapFillers.sort((a, b) => a.price - b.price);
    selectedProduct = gapFillers[0];
  } else {
    // No single product fills the gap — pick the most expensive eligible product
    // (gets closest to threshold)
    eligibleProducts.sort((a, b) => b.price - a.price);
    selectedProduct = eligibleProducts[0];
  }

  if (!selectedProduct) {
    return baseResult;
  }

  const remainingGap = Math.max(0, gap - selectedProduct.price);
  const reason =
    remainingGap === 0
      ? `Add this to get free delivery! (₹${gap.toFixed(0)} away from free delivery)`
      : `Add this to get closer to free delivery (₹${gap.toFixed(0)} away)`;

  const suggestion: ProductSuggestion = {
    product: selectedProduct,
    reason,
    confidence: 0.9, // Gap-fill suggestions are high confidence by nature
  };

  return {
    suggestion,
    cartTotal,
    threshold,
    gap,
  };
}
