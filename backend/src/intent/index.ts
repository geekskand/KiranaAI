/**
 * Intent Engine — barrel export.
 *
 * The Intent Intelligence Layer: the brain of KiranaAI that turns queries into
 * judgment via retrieval, fusion, and decision intelligence.
 */

export * from './types.js';
export { runIntentEngine } from './intent-engine.js';
export type { IntentEngineInput, IntentEngineResult } from './intent-engine.js';
export { understand } from './intent-router.js';
export { planRetrieval, executeRetrieval } from './retrieval-orchestrator.js';
export { fuseContext } from './context-fusion.js';
export { decide } from './decision-agent.js';
export {
  predictBasketCompletions,
  predictGapFill,
  predictUsualBasket,
} from './predictive.js';
export {
  learnAcceptance,
  learnRejection,
  learnFromMessage,
  learnCartAdd,
} from './learning.js';

// RAG singletons
export { memoryRag } from './rag/memory-rag.js';
export { decisionRag } from './rag/decision-rag.js';
export { sessionRag } from './rag/session-rag.js';
export { productRag } from './rag/product-rag.js';
export { householdRag } from './rag/household-rag.js';
