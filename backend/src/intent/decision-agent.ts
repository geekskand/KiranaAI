/**
 * Decision Intelligence Agent — the judgment layer.
 *
 * Consumes a FusedContext and decides whether to ACT, ASK, SHORTLIST,
 * SUBSTITUTE, or PREDICT. Behaves like a kirana shopkeeper: optimize for the
 * correct decision, not maximum product exposure.
 *
 * Constraints:
 *  - One-question rule: never ask more than one question per turn.
 *  - Question priority: Allergy → Dietary → Brand → Quantity.
 *  - Always honor dietary flags as hard constraints.
 */

import type { Decision, FusedContext } from './types.js';
import type { ProductCard, DietaryFlag } from '../models/types.js';
import { productRag } from './rag/product-rag.js';
import type { CatalogProduct } from '../seed/catalog.js';

const HIGH_CONFIDENCE = 0.85;
const MEDIUM_CONFIDENCE = 0.55;

/** Does a product violate a dietary flag? (hard constraint) */
function violatesDiet(p: CatalogProduct, flags: DietaryFlag[]): boolean {
  for (const flag of flags) {
    switch (flag) {
      case 'vegan':
        if (p.category === 'dairy' || (p.dietaryLabels || []).includes('non-veg')) return true;
        break;
      case 'vegetarian':
        if ((p.labels || []).some((l) => ['non-veg', 'meat', 'chicken', 'fish', 'egg'].includes(l.toLowerCase()))) return true;
        break;
      case 'dairy-free':
        if (p.category === 'dairy') return true;
        break;
      case 'gluten-free':
        if (!p.isGlutenFree) return true;
        break;
      case 'low-sugar':
        if (!p.isLowSugar) return true;
        break;
      case 'organic-only':
        if (!p.isOrganic) return true;
        break;
    }
  }
  return false;
}

function toCard(p: CatalogProduct, reason?: string): ProductCard {
  return {
    productId: p.productId,
    name: p.name,
    price: p.price,
    brand: p.brand,
    category: p.category,
    reason,
  };
}

/** Resolve fused candidates back to full catalog products and apply hard filters. */
function eligibleProducts(ctx: FusedContext): CatalogProduct[] {
  const resolved = ctx.candidates
    .map((c) => productRag.get(c.productId))
    .filter((p): p is CatalogProduct => Boolean(p));

  return resolved.filter((p) => {
    if (violatesDiet(p, ctx.dietaryFlags)) return false;
    if (ctx.avoidedBrands.includes(p.brand)) return false;
    if (ctx.rejectedBrands.includes(p.brand)) return false;
    return true;
  });
}

/** Rank eligible products using fused preference/learning signals. */
function rank(products: CatalogProduct[], ctx: FusedContext): CatalogProduct[] {
  return [...products].sort((a, b) => score(b, ctx) - score(a, ctx));
}

function score(p: CatalogProduct, ctx: FusedContext): number {
  let s = 0;
  if (ctx.preferredBrand && p.brand === ctx.preferredBrand) s += 5;
  if (ctx.acceptedBrands.includes(p.brand)) s += 3;
  if (ctx.priceSensitive) s += Math.max(0, 3 - p.price / 50); // cheaper scores higher
  // Health-aligned bonus
  if (ctx.dietaryFlags.includes('organic-only') && p.isOrganic) s += 2;
  if (ctx.dietaryFlags.includes('low-sugar') && p.isLowSugar) s += 2;
  return s;
}

export function decide(ctx: FusedContext): Decision {
  const reasoning: string[] = [];
  reasoning.push(`Intent: ${ctx.intent.kind} (entity: ${ctx.query})`);
  if (ctx.preferredBrand) reasoning.push(`Preferred brand: ${ctx.preferredBrand}`);
  if (ctx.avoidedBrands.length) reasoning.push(`Avoids: ${ctx.avoidedBrands.join(', ')}`);
  if (ctx.rejectedBrands.length) reasoning.push(`Previously rejected: ${ctx.rejectedBrands.join(', ')}`);
  if (ctx.priceSensitive) reasoning.push('Learned: price-sensitive');
  if (ctx.dietaryFlags.length) reasoning.push(`Dietary: ${ctx.dietaryFlags.join(', ')}`);

  // Conversational intents
  if (ctx.intent.kind === 'greeting') {
    return decision('ASK', "Hello! I'm KiranaAI — tell me what you need and I'll handle the rest.", [], 0.95, reasoning);
  }
  if (ctx.intent.kind === 'help') {
    return decision(
      'ASK',
      'Just name a product (like "milk" or "healthy snacks") and I\'ll pick the best option for you, suggest substitutes, and complete your basket. What do you need?',
      [],
      0.9,
      reasoning
    );
  }

  const eligible = rank(eligibleProducts(ctx), ctx);

  // Nothing matched the catalog
  if (eligible.length === 0) {
    // If a dietary conflict removed everything, explain it (kirana judgment)
    const resolvedAll = ctx.candidates.map((c) => productRag.get(c.productId)).filter(Boolean) as CatalogProduct[];
    if (resolvedAll.length > 0 && ctx.dietaryFlags.length > 0) {
      reasoning.push('All matches blocked by dietary constraints');
      return decision(
        'ASK',
        `Those options don't fit your ${ctx.dietaryFlags.join('/')} preference. Want me to find a compliant alternative?`,
        [],
        0.7,
        reasoning
      );
    }
    return decision('ASK', "I couldn't find that in the catalog. Could you tell me the product name again?", [], 0.4, reasoning);
  }

  // ─── ADD intent ────────────────────────────────────────────────────────────
  if (ctx.intent.kind === 'add') {
    const top = eligible[0];

    // Strong preference OR price-sensitive single clear winner → ACT
    const hasStrongSignal =
      (ctx.preferredBrand && top.brand === ctx.preferredBrand) ||
      ctx.acceptedBrands.includes(top.brand) ||
      ctx.priceSensitive;

    if (hasStrongSignal) {
      reasoning.push(`ACT: auto-add ${top.name} (confident from fused signals)`);
      return decision(
        'ACT',
        `Added ${top.name} — ₹${top.price}.${ctx.deliveryGap > 0 ? ` You're ₹${ctx.deliveryGap} from free delivery.` : ''}`,
        [toCard(top, ctx.preferredBrand === top.brand ? 'Your usual choice' : 'Best match for you')],
        HIGH_CONFIDENCE,
        reasoning
      );
    }

    // Multiple comparable options, no strong signal → ASK brand (highest-priority gap)
    if (eligible.length > 1) {
      reasoning.push('ASK: brand preference unknown for this category');
      return decision(
        'ASK',
        `Which would you prefer — ${eligible[0].brand} (₹${eligible[0].price}) or ${eligible[1].brand} (₹${eligible[1].price})?`,
        eligible.slice(0, 2).map((p) => toCard(p, `${p.brand} • ₹${p.price}`)),
        MEDIUM_CONFIDENCE,
        reasoning,
        `${eligible[0].brand} or ${eligible[1].brand}?`
      );
    }

    // Single option → ACT
    reasoning.push(`ACT: only one eligible option, ${top.name}`);
    return decision('ACT', `Added ${top.name} — ₹${top.price}.`, [toCard(top, 'Added to cart')], HIGH_CONFIDENCE, reasoning);
  }

  // ─── SUBSTITUTE intent ───────────────────────────────────────────────────────
  if (ctx.intent.kind === 'substitute') {
    const category = eligible[0].category;
    const alts = rank(
      productRag.inCategory(category).filter((p) => !violatesDiet(p, ctx.dietaryFlags) && !ctx.avoidedBrands.includes(p.brand) && !ctx.rejectedBrands.includes(p.brand)),
      ctx
    ).slice(0, 3);
    reasoning.push(`SUBSTITUTE: ${alts.length} compliant alternatives in ${category}`);
    return decision(
      'SUBSTITUTE',
      `Here ${alts.length === 1 ? 'is a substitute' : 'are substitutes'} that fit your preferences. Add one?`,
      alts.map((p) => toCard(p, p.brand === ctx.preferredBrand ? 'Matches your usual brand' : 'Compliant alternative')),
      MEDIUM_CONFIDENCE,
      reasoning
    );
  }

  // ─── SEARCH / QUESTION intent → SHORTLIST ────────────────────────────────────
  reasoning.push(`SHORTLIST: ${Math.min(eligible.length, 3)} curated options`);
  const shortlist = eligible.slice(0, 3);
  const lead = ctx.dietaryFlags.length
    ? `Here are ${shortlist.length} options that fit your ${ctx.dietaryFlags.join('/')} preference.`
    : `Here ${shortlist.length === 1 ? 'is an option' : `are ${shortlist.length} options`} for you.`;
  return decision(
    'SHORTLIST',
    `${lead} Want me to add one?`,
    shortlist.map((p, i) => toCard(p, i === 0 ? 'Top pick for you' : `${p.brand} • ₹${p.price}`)),
    MEDIUM_CONFIDENCE,
    reasoning
  );
}

function decision(
  action: Decision['action'],
  message: string,
  products: ProductCard[],
  confidence: number,
  reasoning: string[],
  question?: string
): Decision {
  return { action, message, products, confidence, reasoning, question };
}
