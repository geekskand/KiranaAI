/**
 * One-off script: dump the catalog to the frontend as a static JSON module.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalog } from './catalog.js';

const out = catalog.map((p) => ({
  productId: p.productId,
  name: p.name,
  brand: p.brand,
  category: p.category,
  price: p.price,
  imageUrl: p.imageUrl,
  isOrganic: p.isOrganic,
  isLowSugar: p.isLowSugar,
  isGlutenFree: p.isGlutenFree,
  containsPalmOil: p.containsPalmOil,
  qualityTier: p.qualityTier,
  inStock: p.inStock,
  dietaryLabels: p.dietaryLabels,
}));

const dir = join(process.cwd(), '..', 'frontend', 'src', 'data');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'products.json'), JSON.stringify(out, null, 0));
console.log(`Wrote ${out.length} products to frontend/src/data/products.json`);
