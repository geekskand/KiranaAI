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
import { coOccurrenceRules, type CatalogProduct } from '../seed/catalog.js';

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
    imageUrl: p.imageUrl,
    reason,
  };
}

/** Resolve fused candidates back to full catalog products and apply hard filters. */
function eligibleProducts(ctx: FusedContext): CatalogProduct[] {
  const resolved = ctx.candidates
    .map((c) => productRag.get(c.productId))
    .filter((p): p is CatalogProduct => Boolean(p));

  // Expand the candidate pool to the FULL category so ranking (and "cheapest")
  // considers every option, not just the top semantic matches.
  const category = resolved[0]?.category;
  const pool = category
    ? [...new Map([...resolved, ...productRag.inCategory(category)].map((p) => [p.productId, p])).values()]
    : resolved;

  return pool.filter((p) => {
    if (!p.inStock) return false;
    if (violatesDiet(p, ctx.dietaryFlags)) return false;
    if (ctx.avoidedBrands.includes(p.brand)) return false;
    if (ctx.rejectedBrands.includes(p.brand)) return false;
    return true;
  });
}

/** Rank eligible products by their Decision Score (highest first).
 * For price-sensitive users, cheapest wins outright (ties broken by score),
 * so the "budget shopper always gets the cheapest" promise is guaranteed. */
function rank(products: CatalogProduct[], ctx: FusedContext): CatalogProduct[] {
  if (ctx.priceSensitive) {
    return [...products].sort(
      (a, b) => a.price - b.price || decisionScore(b, ctx).total - decisionScore(a, ctx).total
    );
  }
  return [...products].sort((a, b) => decisionScore(b, ctx).total - decisionScore(a, ctx).total);
}

/**
 * Decision Score — the core ranking algorithm.
 *
 *   Score = wB·BrandAffinity + wP·PriceAffinity + wH·HealthAffinity
 *         + wR·Recency + wC·BasketContext
 *
 * Each term is normalised to 0..1. Brand affinity and recency are the weighted
 * edges of the per-user preference graph (updated on every accept/reject by the
 * learning loop). Price affinity rewards cheaper items when the user is price
 * sensitive. Health affinity rewards dietary alignment. Basket context rewards
 * items that co-occur with what is already in the cart.
 */
const WEIGHTS = { brand: 0.40, price: 0.20, health: 0.15, recency: 0.10, basket: 0.15 } as const;

interface ScoreBreakdown {
  brand: number;
  price: number;
  health: number;
  recency: number;
  basket: number;
  total: number;
}

function decisionScore(p: CatalogProduct, ctx: FusedContext): ScoreBreakdown {
  // Brand affinity (0..1): preference-graph edge weight; boosted if accepted before.
  let brand = ctx.brandAffinity[p.brand] ?? 0;
  if (ctx.acceptedBrands.includes(p.brand)) brand = Math.min(1, brand + 0.4);
  if (ctx.preferredBrand === p.brand) brand = Math.max(brand, 0.9);

  // Price affinity (0..1): cheaper scores higher, only weighted if price sensitive.
  // Normalised against the candidate price range.
  const prices = ctx.candidates.map((c) => c.price);
  const min = Math.min(...prices, p.price);
  const max = Math.max(...prices, p.price);
  const norm = max > min ? (max - p.price) / (max - min) : 1;
  const price = ctx.priceSensitive ? norm : norm * 0.3;

  // Health affinity (0..1): alignment with dietary flags.
  let health = 0;
  if (ctx.dietaryFlags.includes('organic-only')) health += p.isOrganic ? 1 : 0;
  if (ctx.dietaryFlags.includes('low-sugar')) health += p.isLowSugar ? 1 : 0;
  if (ctx.dietaryFlags.includes('gluten-free')) health += p.isGlutenFree ? 1 : 0;
  if (!p.containsPalmOil) health += 0.3;
  health = Math.min(1, health);

  // Recency (0..1): how recently this brand was chosen.
  const recency = ctx.brandRecency[p.brand] ?? 0;

  // Basket context (0..1): does this item co-occur with current cart items?
  const basket = basketContextScore(p, ctx);

  const total =
    WEIGHTS.brand * brand +
    WEIGHTS.price * price +
    WEIGHTS.health * health +
    WEIGHTS.recency * recency +
    WEIGHTS.basket * basket;

  return { brand, price, health, recency, basket, total };
}

/** Basket-context affinity from co-occurrence rules. */
function basketContextScore(p: CatalogProduct, ctx: FusedContext): number {
  if (ctx.cartProductIds.length === 0) return 0;
  let best = 0;
  for (const cartId of ctx.cartProductIds) {
    const rule = coOccurrenceRules.find((r) => r.triggerProductId === cartId);
    if (!rule) continue;
    const companion = rule.companions.find((c) => c.productId === p.productId);
    if (companion) best = Math.max(best, companion.frequency);
  }
  return best;
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
      const sb = decisionScore(top, ctx);
      reasoning.push(
        `Decision Score for ${top.name} = ${sb.total.toFixed(2)} ` +
        `[brand ${sb.brand.toFixed(2)} · price ${sb.price.toFixed(2)} · health ${sb.health.toFixed(2)} · recency ${sb.recency.toFixed(2)} · basket ${sb.basket.toFixed(2)}]`
      );
      reasoning.push(`ACT: auto-add ${top.name} (top Decision Score)`);
      const gapAfter = Math.max(0, ctx.freeDeliveryThreshold - (ctx.cartValue + top.price));
      const gapNote = gapAfter > 0 ? ` You're ₹${gapAfter} from free delivery.` : ' Free delivery unlocked!';
      return decision(
        'ACT',
        `Added ${top.name} — ₹${top.price}.${gapNote}`,
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
