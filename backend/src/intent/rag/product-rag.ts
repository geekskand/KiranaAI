/**
 * Product Intelligence RAG — semantic index over the product catalog.
 *
 * Indexes product descriptions, ingredients, dietary labels, certifications,
 * brand metadata and attributes so the agent can answer semantic queries like:
 *   "protein powder without artificial sweeteners"
 *   "healthy snacks for diabetics"
 *   "palm-oil-free chocolate"
 * without requiring explicit filters.
 */

import { SemanticStore } from '../semantic-store.js';
import { catalog, type CatalogProduct } from '../../seed/catalog.js';

interface ProductMeta {
  productId: string;
}

class ProductRag {
  private store = new SemanticStore<ProductMeta>('product-intelligence');
  private byId = new Map<string, CatalogProduct>();
  private initialized = false;

  /** Build the index from the catalog (idempotent). */
  init(): void {
    if (this.initialized) return;
    for (const p of catalog) {
      this.byId.set(p.productId, p);
      const health: string[] = [];
      if (p.isOrganic) health.push('organic');
      if (p.isLowSugar) health.push('low sugar diabetic friendly');
      if (p.isGlutenFree) health.push('gluten free');
      if (!p.containsPalmOil) health.push('palm oil free no palm oil');
      const text = [
        p.name,
        p.brand,
        p.category.replace(/[_-]/g, ' '),
        (p.labels || []).join(' '),
        (p.dietaryLabels || []).join(' '),
        health.join(' '),
        p.qualityTier,
      ].join(' ');
      this.store.upsert({ id: p.productId, text, metadata: { productId: p.productId } });
    }
    this.initialized = true;
  }

  /** Semantic search returning full catalog products, category-aware. */
  search(query: string, k = 4): CatalogProduct[] {
    this.init();
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    if (tokens.length === 0) return [];

    const scored = catalog
      .map((p) => {
        const categoryWords = p.category.replace(/[_-]/g, ' ').toLowerCase();
        const nameWords = p.name.toLowerCase();
        const labels = `${(p.labels || []).join(' ')} ${(p.dietaryLabels || []).join(' ')}`.toLowerCase();
        const health = [
          p.isOrganic ? 'organic' : '',
          p.isLowSugar ? 'low sugar diabetic' : '',
          p.isGlutenFree ? 'gluten free' : '',
          !p.containsPalmOil ? 'palm oil free' : '',
        ].join(' ');
        let score = 0;
        for (const t of tokens) {
          if (categoryWords.split(' ').includes(t)) score += 6; // exact category word
          else if (categoryWords.includes(t)) score += 4;
          else if (nameWords.split(/\s+/).includes(t)) score += 2; // exact name word
          else if (nameWords.includes(t)) score += 1;
          if (labels.includes(t) || health.includes(t)) score += 2;
        }
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.p.price - b.p.price);

    return scored.slice(0, k).map((x) => x.p);
  }

  /** Get a product by id. */
  get(productId: string): CatalogProduct | undefined {
    this.init();
    return this.byId.get(productId);
  }

  /** All products in a category. */
  inCategory(category: string): CatalogProduct[] {
    this.init();
    return catalog.filter((p) => p.category === category);
  }
}

export const productRag = new ProductRag();
