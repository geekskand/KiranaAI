/**
 * Intent Engine — the brain of KiranaAI.
 *
 * Pipeline:
 *   User Query
 *     → Intent Understanding   (intent-router)
 *     → Retrieval Planning     (retrieval-orchestrator.planRetrieval)
 *     → Multi-RAG Retrieval    (retrieval-orchestrator.executeRetrieval)
 *     → Context Fusion         (context-fusion.fuseContext)
 *     → Decision Intelligence  (decision-agent.decide)
 *     → Action + Prediction    (predictive)
 *     → Learning Feedback Loop (learning)
 *
 * The Decision Intelligence Agent consumes ONLY the fused context.
 */

import type { Decision, Prediction } from './types.js';
import type { UserProfile, CartItem, ProductCard } from '../models/types.js';
import type { PreferenceStoreProvider } from '../providers/interfaces.js';

import { understand } from './intent-router.js';
import { planRetrieval, executeRetrieval } from './retrieval-orchestrator.js';
import { fuseContext } from './context-fusion.js';
import { decide } from './decision-agent.js';
import { predictBasketCompletions, predictGapFill } from './predictive.js';
import { learnFromMessage, learnCartAdd } from './learning.js';
import { productRag } from './rag/product-rag.js';

export interface IntentEngineInput {
  userId: string;
  sessionId: string;
  message: string;
  profile: UserProfile | null;
  cart: CartItem[];
  freeDeliveryThreshold: number;
  preferenceStore?: PreferenceStoreProvider;
}

export interface IntentEngineResult {
  decision: Decision;
  /** Product the engine auto-added (ACT). The caller applies the cart mutation. */
  autoAdd?: ProductCard;
  /** Proactive predictions to surface after the main response. */
  predictions: Prediction[];
  /** Full explainability trace. */
  trace: {
    intent: string;
    sources: string[];
    fragmentCount: number;
    reasoning: string[];
  };
}

export async function runIntentEngine(input: IntentEngineInput): Promise<IntentEngineResult> {
  const { userId, sessionId, message, profile, cart, freeDeliveryThreshold, preferenceStore } = input;

  // 0. Learn from the raw message (memory + session) before deciding.
  learnFromMessage(userId, sessionId, message);

  // 1. Understand intent (with session reference resolution).
  const intent = understand(message, sessionId);

  // 2. Plan retrieval dynamically.
  const plan = planRetrieval(intent);

  // 3. Execute multi-RAG retrieval.
  const retrieval = executeRetrieval(plan, { userId, sessionId });

  // 4. Fuse all sources into a single context object.
  const fused = fuseContext({
    userId,
    sessionId,
    intent,
    retrieval,
    profile,
    cart,
    freeDeliveryThreshold,
  });

  // 5. Decision Intelligence (consumes only fused context).
  const decision = decide(fused);

  // 6. Apply ACT auto-add + learning.
  let autoAdd: ProductCard | undefined;
  if (decision.action === 'ACT' && decision.products[0]) {
    autoAdd = decision.products[0];
    const product = productRag.get(autoAdd.productId);
    if (product) {
      await learnCartAdd(userId, sessionId, product, preferenceStore);
    }
  }

  // 7. Predictive layer — surface proactive needs after a cart change.
  const predictions: Prediction[] = [];
  const projectedCart = autoAdd
    ? [...cart, { productId: autoAdd.productId, name: autoAdd.name, price: autoAdd.price, quantity: 1 }]
    : cart;

  if (projectedCart.length > 0) {
    predictions.push(...predictBasketCompletions(projectedCart, 2));
    const gap = predictGapFill(projectedCart, freeDeliveryThreshold);
    if (gap) predictions.push(gap);
  }

  return {
    decision,
    autoAdd,
    predictions,
    trace: {
      intent: `${intent.kind} (${(intent.confidence * 100).toFixed(0)}%)`,
      sources: plan.sources,
      fragmentCount: retrieval.fragments.length,
      reasoning: decision.reasoning,
    },
  };
}
