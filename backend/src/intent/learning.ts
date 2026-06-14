/**
 * Learning Feedback Loop — every interaction makes KiranaAI smarter.
 *
 * Updates:
 *  - Memory RAG          (conversation insights)
 *  - Decision Memory RAG (accept/reject events)
 *  - Preference Graph    (brand loyalty / dietary) via the provided store
 *
 * The system becomes more accurate with every order.
 */

import { memoryRag } from './rag/memory-rag.js';
import { decisionRag } from './rag/decision-rag.js';
import { sessionRag } from './rag/session-rag.js';
import type { PreferenceStoreProvider } from '../providers/interfaces.js';
import type { CatalogProduct } from '../seed/catalog.js';

/** Record that a user accepted a recommendation. */
export async function learnAcceptance(
  userId: string,
  product: CatalogProduct,
  preferenceStore?: PreferenceStoreProvider,
  reason?: string
): Promise<void> {
  decisionRag.record(userId, {
    category: product.category,
    brand: product.brand,
    outcome: 'accepted',
    reason,
  });
  if (preferenceStore) {
    // Strengthen brand loyalty for this category.
    await preferenceStore.updateBrandLoyalty(userId, product.category, product.brand, 10).catch(() => {});
  }
}

/** Record that a user rejected a recommendation. */
export function learnRejection(
  userId: string,
  product: CatalogProduct,
  reason: 'price_sensitive' | 'brand_dislike' | 'dietary' | 'other' = 'other'
): void {
  decisionRag.record(userId, {
    category: product.category,
    brand: product.brand,
    outcome: 'rejected',
    reason,
  });
  if (reason === 'brand_dislike') {
    memoryRag.remember(userId, `User rejected ${product.brand} in ${product.category}`, {
      kind: 'rejection',
      category: product.category,
      brand: product.brand,
      sentiment: 'negative',
    });
  }
}

/** Ingest a raw user message into memory + session for future retrieval. */
export function learnFromMessage(userId: string, sessionId: string, message: string): void {
  memoryRag.ingestMessage(userId, message);
  sessionRag.record(sessionId, { type: 'query', timestamp: Date.now() });
}

/** Record that an item was added to the cart (session + acceptance learning). */
export async function learnCartAdd(
  userId: string,
  sessionId: string,
  product: CatalogProduct,
  preferenceStore?: PreferenceStoreProvider
): Promise<void> {
  sessionRag.record(sessionId, {
    type: 'add',
    productId: product.productId,
    name: product.name,
    timestamp: Date.now(),
  });
  await learnAcceptance(userId, product, preferenceStore, 'added_to_cart');
}
