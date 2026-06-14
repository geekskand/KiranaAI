/**
 * Rule-Based Agent Provider — fallback implementation.
 *
 * Used when Bedrock is unavailable (local development, demo mode).
 * Pattern-matches user intents via regex/keyword matching and generates
 * templated responses with confidence scoring.
 *
 * Maintains:
 * - One-question-per-turn constraint (Requirement 1.4, 11.2)
 * - Product card formatting (Requirement 1.5)
 * - Confidence-based action routing (Requirement 4.1-4.3)
 *
 * Requirements: 11.1, 11.2
 */

import type { AgentProvider } from '../interfaces.js';
import type {
  AgentContext,
  AgentResponse,
  ProductCard,
} from '../../models/index.js';

// ─── Intent Types ────────────────────────────────────────────────────────────

export type IntentType =
  | 'search'
  | 'add-to-cart'
  | 'substitute'
  | 'greeting'
  | 'help'
  | 'onboarding-answer'
  | 'unknown';

export interface DetectedIntent {
  type: IntentType;
  confidence: number;
  /** Extracted entity from the message (e.g., product name, search query) */
  entity?: string;
}

// ─── Intent Patterns ─────────────────────────────────────────────────────────

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  /** Base confidence when this pattern matches */
  baseConfidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'substitute',
    patterns: [
      /\b(?:substitute|alternative|replace|instead of|similar to|something like|other option)\b/i,
    ],
    baseConfidence: 0.85,
  },
  {
    type: 'add-to-cart',
    patterns: [
      /\b(?:add|add to cart|buy|get me|put in cart|i'll take|i will take)\b/i,
    ],
    baseConfidence: 0.9,
  },
  {
    type: 'search',
    patterns: [
      /\b(?:find|show me|looking for|search for|i need|i want|where is|do you have)\b/i,
    ],
    baseConfidence: 0.85,
  },
  {
    type: 'greeting',
    patterns: [
      /^\s*(?:hi|hello|hey|namaste|good morning|good evening|howdy)\s*[!.]?\s*$/i,
    ],
    baseConfidence: 0.95,
  },
  {
    type: 'help',
    patterns: [
      /\b(?:help|what can you do|how do you work|what do you do|commands|features)\b/i,
    ],
    baseConfidence: 0.9,
  },
  {
    type: 'onboarding-answer',
    patterns: [
      /\b(?:i am|i'm|i prefer|i like|i eat|i don't eat|i avoid|vegetarian|vegan|gluten.free|dairy.free|organic|low.sugar|budget|healthy|quality)\b/i,
    ],
    baseConfidence: 0.7,
  },
];

// ─── Response Templates ──────────────────────────────────────────────────────

const GREETING_RESPONSES = [
  "Hello! I'm your KiranaAI shopping assistant. What can I help you find today?",
  "Hi there! I can help you find products, suggest alternatives, and manage your cart. What are you looking for?",
  "Hey! Ready to help you shop smarter. What do you need?",
];

const HELP_RESPONSE =
  "I can help you with:\n" +
  "• Finding products — just tell me what you're looking for\n" +
  "• Adding items to your cart\n" +
  "• Suggesting substitutes when something is unavailable\n" +
  "• Recommending complementary items for your cart\n\n" +
  "What would you like to do?";

const FALLBACK_RESPONSE =
  "I didn't quite understand that. Could you try rephrasing? I can help you search for products, add items to your cart, or find alternatives.";

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Extract a product/entity reference from the user message after removing intent keywords.
 */
function extractEntity(message: string, intentType: IntentType): string | undefined {
  let cleaned = message.trim();

  switch (intentType) {
    case 'search':
      cleaned = cleaned.replace(
        /\b(?:find|show me|looking for|search for|i need|i want|where is|do you have|any)\b/i,
        ''
      );
      break;
    case 'add-to-cart':
      cleaned = cleaned.replace(
        /\b(?:add|add to cart|buy|get me|put in cart|i'll take|i will take)\b/i,
        ''
      );
      // Also remove trailing "to cart", "to my cart"
      cleaned = cleaned.replace(/\b(?:to\s+(?:my\s+)?cart)\b/i, '');
      break;
    case 'substitute':
      cleaned = cleaned.replace(
        /\b(?:substitute|alternative|replace|instead of|similar to|something like|other option)\b/i,
        ''
      );
      // Remove common prepositions that trail
      cleaned = cleaned.replace(/^\s*(?:for|to|of)\s+/i, '');
      break;
    default:
      return undefined;
  }

  cleaned = cleaned.replace(/[?.!,]/g, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Detect the user's intent from a message using pattern matching.
 */
export function detectIntent(message: string): DetectedIntent {
  const trimmed = message.trim();

  if (!trimmed) {
    return { type: 'unknown', confidence: 0 };
  }

  for (const intentPattern of INTENT_PATTERNS) {
    for (const regex of intentPattern.patterns) {
      if (regex.test(trimmed)) {
        const entity = extractEntity(trimmed, intentPattern.type);

        // Boost confidence if entity was clearly extracted
        let confidence = intentPattern.baseConfidence;
        if (entity && entity.length > 1) {
          confidence = Math.min(confidence + 0.05, 1.0);
        }

        return {
          type: intentPattern.type,
          confidence,
          entity,
        };
      }
    }
  }

  return { type: 'unknown', confidence: 0.1 };
}

/**
 * Generate a mock product card for demonstration purposes.
 */
function generateProductCard(query: string): ProductCard {
  // Simplified: produce a card with the query term as part of the name
  const capitalizedQuery = query.charAt(0).toUpperCase() + query.slice(1);
  return {
    productId: `product-${query.replace(/\s+/g, '-').toLowerCase()}`,
    name: capitalizedQuery,
    price: Math.round((10 + Math.random() * 90) * 100) / 100,
    reason: `Matched your search for "${query}"`,
  };
}

/**
 * Generate a deterministic product card for testing (no randomness).
 */
function generateDeterministicProductCard(query: string): ProductCard {
  const capitalizedQuery = query.charAt(0).toUpperCase() + query.slice(1);
  return {
    productId: `product-${query.replace(/\s+/g, '-').toLowerCase()}`,
    name: capitalizedQuery,
    price: 49.99,
    reason: `Matched your search for "${query}"`,
  };
}

// ─── Rule-Based Agent Provider ───────────────────────────────────────────────

/**
 * Rule-based implementation of AgentProvider.
 *
 * Provides conversational fallback when Bedrock is unavailable.
 * Matches user intents via regex patterns and generates
 * templated responses with appropriate confidence scoring.
 */
export class RuleBasedAgentProvider implements AgentProvider {
  private deterministic: boolean;

  constructor(options?: { deterministic?: boolean }) {
    this.deterministic = options?.deterministic ?? false;
  }

  async invoke(context: AgentContext, message: string): Promise<AgentResponse> {
    const intent = detectIntent(message);

    switch (intent.type) {
      case 'greeting':
        return this.handleGreeting();

      case 'help':
        return this.handleHelp();

      case 'search':
        return this.handleSearch(intent, context);

      case 'add-to-cart':
        return this.handleAddToCart(intent, context);

      case 'substitute':
        return this.handleSubstitute(intent, context);

      case 'onboarding-answer':
        return this.handleOnboardingAnswer(intent, context);

      case 'unknown':
      default:
        return this.handleUnknown();
    }
  }

  private handleGreeting(): AgentResponse {
    const content = this.deterministic
      ? GREETING_RESPONSES[0]
      : GREETING_RESPONSES[Math.floor(Math.random() * GREETING_RESPONSES.length)];

    return {
      content,
    };
  }

  private handleHelp(): AgentResponse {
    return {
      content: HELP_RESPONSE,
    };
  }

  private handleSearch(intent: DetectedIntent, _context: AgentContext): AgentResponse {
    const query = intent.entity || 'products';
    const card = this.deterministic
      ? generateDeterministicProductCard(query)
      : generateProductCard(query);

    return {
      content: `Here's what I found for "${query}". Would you like to add any of these to your cart?`,
      products: [card],
      action: 'suggest',
    };
  }

  private handleAddToCart(intent: DetectedIntent, _context: AgentContext): AgentResponse {
    const productName = intent.entity || 'the item';

    if (!intent.entity) {
      // No specific product identified — ask which product
      return {
        content: "Which product would you like me to add to your cart?",
      };
    }

    const card = this.deterministic
      ? generateDeterministicProductCard(productName)
      : generateProductCard(productName);

    // High confidence for explicit add-to-cart intents
    return {
      content: `I've added ${productName} to your cart.`,
      products: [card],
      action: 'auto-added',
    };
  }

  private handleSubstitute(intent: DetectedIntent, _context: AgentContext): AgentResponse {
    const productName = intent.entity || 'that product';

    if (!intent.entity) {
      return {
        content: "Which product would you like me to find a substitute for?",
      };
    }

    const substitute = this.deterministic
      ? generateDeterministicProductCard(`${productName} alternative`)
      : generateProductCard(`${productName} alternative`);

    return {
      content: `Here's a substitute option for ${productName}. Would you like to add it to your cart?`,
      products: [substitute],
      action: 'suggest',
    };
  }

  private handleOnboardingAnswer(_intent: DetectedIntent, context: AgentContext): AgentResponse {
    // Check onboarding progress from conversation history
    const onboardingQuestions = context.conversationHistory.filter(
      (msg) => msg.role === 'assistant' && msg.content.includes('?')
    ).length;

    if (onboardingQuestions < 3) {
      // Continue onboarding — ask the next question (one at a time)
      const nextQuestions = [
        "What types of food do you usually buy? (e.g., vegetarian, organic, budget-friendly)",
        "Do you have any dietary preferences or restrictions?",
        "Do you have any favorite brands you'd like me to prioritize?",
      ];

      const nextIndex = Math.min(onboardingQuestions, nextQuestions.length - 1);
      return {
        content: `Thanks for sharing! ${nextQuestions[nextIndex]}`,
      };
    }

    // Onboarding complete
    return {
      content: "Great, I've noted your preferences! I'll use these to personalize your recommendations. What would you like to shop for today?",
    };
  }

  private handleUnknown(): AgentResponse {
    return {
      content: FALLBACK_RESPONSE,
    };
  }
}
