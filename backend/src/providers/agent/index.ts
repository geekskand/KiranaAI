/**
 * Agent provider module exports.
 */

export {
  BedrockAgentProvider,
  convertToBedrockMessages,
  extractConfidence,
  routeAction,
  extractProductCards,
  enforceOneQuestion,
} from './bedrock.js';

export type { ToolDispatcher, BedrockAgentConfig } from './bedrock.js';

export { RuleBasedAgentProvider, detectIntent } from './rule-based.js';

export type { IntentType, DetectedIntent } from './rule-based.js';
