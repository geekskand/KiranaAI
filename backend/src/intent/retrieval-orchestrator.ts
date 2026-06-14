/**
 * Retrieval Orchestrator — decides which knowledge sources to query for a
 * given request, then executes the retrieval across all selected RAGs.
 *
 * The retrieval plan is generated dynamically per intent. Example:
 *   "Add milk"          → preference, decision, session, inventory, pricing
 *   "Need healthy snacks"→ preference(dietary), product, decision
 *   "Plan next week"     → household, decision, preference, product
 */

import type {
  UnderstoodIntent,
  RetrievalPlan,
  RetrievalResult,
  RetrievedFragment,
  RetrievalSource,
} from './types.js';
import { memoryRag } from './rag/memory-rag.js';
import { decisionRag } from './rag/decision-rag.js';
import { sessionRag } from './rag/session-rag.js';
import { productRag } from './rag/product-rag.js';
import { householdRag } from './rag/household-rag.js';

export interface RetrievalContext {
  userId: string;
  sessionId: string;
  householdId?: string;
}

/** Build a dynamic retrieval plan based on the understood intent. */
export function planRetrieval(intent: UnderstoodIntent): RetrievalPlan {
  const sources: RetrievalSource[] = [];
  const rationale: Record<string, string> = {};
  const add = (s: RetrievalSource, why: string) => {
    if (!sources.includes(s)) {
      sources.push(s);
      rationale[s] = why;
    }
  };

  // Preference + memory are almost always relevant.
  add('preference', 'Apply known brand/dietary preferences');
  add('memory', 'Recall complaints, rejections, and special instructions');

  switch (intent.kind) {
    case 'add':
      add('decision', 'Use past accept/reject outcomes for this category');
      add('session', 'Maintain conversation context');
      add('inventory', 'Confirm availability');
      add('pricing', 'Fetch current price');
      add('product', 'Resolve the product from catalog');
      break;
    case 'search':
    case 'question':
      add('product', 'Semantic product retrieval');
      add('decision', 'Bias toward previously accepted choices');
      break;
    case 'substitute':
      add('product', 'Find alternatives in the same category');
      add('decision', 'Avoid previously rejected substitutes');
      add('inventory', 'Only suggest in-stock items');
      break;
    case 'plan':
      add('household', 'Incorporate household member needs');
      add('decision', 'Use replenishment and purchase history');
      add('product', 'Resolve products for the plan');
      break;
    case 'remove':
      add('session', 'Resolve which cart item to remove');
      break;
    default:
      add('product', 'Best-effort product retrieval');
  }

  return { sources, query: intent.entity ?? intent.rawText, rationale };
}

/** Execute the retrieval plan across all selected sources. */
export function executeRetrieval(
  plan: RetrievalPlan,
  ctx: RetrievalContext
): RetrievalResult {
  const fragments: RetrievedFragment[] = [];

  for (const source of plan.sources) {
    switch (source) {
      case 'memory':
        for (const d of memoryRag.retrieve(ctx.userId, plan.query, 4)) {
          fragments.push({ source, text: d.text, score: d.score, metadata: d.metadata as unknown as Record<string, unknown> });
        }
        break;
      case 'decision':
        for (const d of decisionRag.retrieve(ctx.userId, plan.query, 4)) {
          fragments.push({ source, text: d.text, score: d.score, metadata: d.metadata as unknown as Record<string, unknown> });
        }
        break;
      case 'session':
        for (const d of sessionRag.retrieve(ctx.sessionId, plan.query, 4)) {
          fragments.push({ source, text: d.text, score: d.score, metadata: d.metadata });
        }
        break;
      case 'product':
        productRag.search(plan.query, 4).forEach((p, i) => {
          fragments.push({
            source,
            text: `${p.name} (${p.brand}) ₹${p.price}`,
            score: 1 - i * 0.1,
            metadata: { productId: p.productId },
          });
        });
        break;
      case 'household':
        if (ctx.householdId) {
          for (const d of householdRag.retrieve(ctx.householdId, plan.query, 5)) {
            fragments.push({ source, text: d.text, score: d.score, metadata: d.metadata as unknown as Record<string, unknown> });
          }
        }
        break;
      // preference / pricing / inventory are resolved during fusion
      default:
        break;
    }
  }

  return { plan, fragments };
}
