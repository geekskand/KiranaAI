/**
 * Bedrock Claude Agent Provider for KiranaAI.
 *
 * Invokes AWS Bedrock Claude with system prompt, conversation context,
 * and tool definitions. Parses tool-use responses and dispatches to
 * domain engines. Computes confidence scores and routes actions.
 *
 * Requirements: 1.2, 1.3, 4.1, 4.2, 4.3
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message as BedrockMessage,
  type ContentBlock,
  type ToolConfiguration,
  type ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

import type { AgentProvider } from '../interfaces.js';
import type {
  AgentContext,
  AgentResponse,
  Message,
  ProductCard,
} from '../../models/index.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.55;

const SYSTEM_PROMPT = `You are KiranaAI, an intelligent shopping assistant for a quick-commerce grocery platform.

Your responsibilities:
- Help users find products and make purchase decisions
- Remember user preferences (dietary restrictions, brand loyalty, quality preferences)
- Suggest substitutes when preferred products are unavailable
- Auto-add items when you are highly confident in a recommendation
- Present options when uncertain about user preferences
- Suggest complementary products (basket completion) and gap-fill items for free delivery

Behavioral rules:
- Ask at most ONE question per response turn
- When confidence is high (>0.85), auto-add the product and inform the user
- When confidence is medium (0.55-0.85), suggest the product and ask for confirmation
- When confidence is low (<0.55), present a shortlist of 2-3 alternatives
- Always provide product cards with name, price, and add-to-cart action for referenced products
- Be concise, helpful, and conversational in tone
- Respect dietary restrictions absolutely — never recommend products that violate them

When you use tools, include a "confidence" field (0-1) in your reasoning to indicate how sure you are about the recommendation.`;

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOL_DEFINITIONS: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: 'lookup_preference',
        description:
          'Look up user preferences including dietary flags, brand loyalty scores, and quality preferences for a specific category or overall profile.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: 'The user ID to look up preferences for',
              },
              category: {
                type: 'string',
                description: 'Optional category to filter preferences',
              },
            },
            required: ['userId'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'search_products',
        description:
          'Search the product catalog by query, category, and optional filters (price range, brands, labels, dietary flags).',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for products',
              },
              category: {
                type: 'string',
                description: 'Optional category to filter results',
              },
              filters: {
                type: 'object',
                description: 'Optional filters',
                properties: {
                  minPrice: { type: 'number' },
                  maxPrice: { type: 'number' },
                  brands: { type: 'array', items: { type: 'string' } },
                  labels: { type: 'array', items: { type: 'string' } },
                  dietaryFlags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['query'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'check_quality_tolerance',
        description:
          'Check if a substitute product meets the user quality tolerance for an original product they wanted.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: 'The user ID',
              },
              originalProductId: {
                type: 'string',
                description: 'The product ID the user originally wanted',
              },
              substituteProductId: {
                type: 'string',
                description: 'The proposed substitute product ID',
              },
            },
            required: ['userId', 'originalProductId', 'substituteProductId'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'update_cart',
        description: 'Add or remove a product from the user cart.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'The session ID',
              },
              productId: {
                type: 'string',
                description: 'The product to add or remove',
              },
              action: {
                type: 'string',
                enum: ['add', 'remove'],
                description: 'Whether to add or remove the product',
              },
            },
            required: ['sessionId', 'productId', 'action'],
          },
        },
      },
    },
  ],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolDispatcher {
  dispatch(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}

export interface BedrockAgentConfig {
  region?: string;
  modelId?: string;
  client?: BedrockRuntimeClient;
  toolDispatcher?: ToolDispatcher;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Convert internal conversation history to Bedrock message format.
 */
export function convertToBedrockMessages(
  history: Message[]
): BedrockMessage[] {
  return history.map((msg) => ({
    role: msg.role,
    content: [{ text: msg.content }],
  }));
}

/**
 * Extract confidence score from agent response text or tool outputs.
 * Looks for patterns like "confidence: 0.9" or "confidence_score: 0.85"
 */
export function extractConfidence(
  responseText: string,
  toolOutputs: Array<{ output: Record<string, unknown> }>
): number {
  // Check tool outputs for confidence/score fields
  for (const toolOutput of toolOutputs) {
    if (typeof toolOutput.output?.confidence === 'number') {
      return toolOutput.output.confidence as number;
    }
    if (typeof toolOutput.output?.score === 'number') {
      return toolOutput.output.score as number;
    }
  }

  // Check response text for confidence patterns
  const confidenceMatch = responseText.match(
    /confidence[_\s]*(?:score)?[:\s]*([0-9]*\.?[0-9]+)/i
  );
  if (confidenceMatch) {
    const value = parseFloat(confidenceMatch[1]);
    if (value >= 0 && value <= 1) {
      return value;
    }
  }

  // Default to medium confidence if not determinable
  return 0.7;
}

/**
 * Route action based on confidence score thresholds.
 * >0.85 = auto-add, 0.55-0.85 = suggest, <0.55 = shortlist
 */
export function routeAction(
  confidence: number
): 'auto-added' | 'suggest' | 'shortlist' {
  if (confidence > HIGH_CONFIDENCE_THRESHOLD) {
    return 'auto-added';
  }
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return 'suggest';
  }
  return 'shortlist';
}

/**
 * Extract product cards from tool outputs (search results).
 */
export function extractProductCards(
  toolOutputs: Array<{ tool: string; output: Record<string, unknown> }>
): ProductCard[] {
  const products: ProductCard[] = [];

  for (const toolOutput of toolOutputs) {
    if (toolOutput.tool === 'search_products' && Array.isArray(toolOutput.output)) {
      for (const product of toolOutput.output) {
        if (product && typeof product === 'object') {
          products.push({
            productId: (product as Record<string, unknown>).productId as string,
            name: (product as Record<string, unknown>).name as string,
            price: (product as Record<string, unknown>).price as number,
            imageUrl: (product as Record<string, unknown>).imageUrl as string | undefined,
          });
        }
      }
    }
  }

  return products;
}

/**
 * Enforce one-question-per-turn constraint by truncating extra questions.
 */
export function enforceOneQuestion(text: string): string {
  // Count question marks
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks <= 1) {
    return text;
  }

  // Keep text up to and including the first question mark
  const firstQuestionIndex = text.indexOf('?');
  const beforeFirstQuestion = text.substring(0, firstQuestionIndex + 1);

  // Get remaining text after first question
  const afterFirstQuestion = text.substring(firstQuestionIndex + 1);

  // Remove subsequent sentences that contain question marks
  const sentences = afterFirstQuestion.split(/(?<=[.!?])\s+/);
  const nonQuestionSentences = sentences.filter((s) => !s.includes('?'));

  return beforeFirstQuestion + (nonQuestionSentences.length > 0 ? ' ' + nonQuestionSentences.join(' ') : '');
}

// ─── Bedrock Agent Provider ──────────────────────────────────────────────────

export class BedrockAgentProvider implements AgentProvider {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private toolDispatcher?: ToolDispatcher;

  constructor(config: BedrockAgentConfig = {}) {
    this.client = config.client ?? new BedrockRuntimeClient({
      region: config.region ?? 'ap-south-1',
    });
    this.modelId = config.modelId ?? MODEL_ID;
    this.toolDispatcher = config.toolDispatcher;
  }

  async invoke(context: AgentContext, message: string): Promise<AgentResponse> {
    const toolCalls: Array<{
      tool: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }> = [];

    // Build messages from conversation history + current message
    const messages: BedrockMessage[] = [
      ...convertToBedrockMessages(context.conversationHistory),
      { role: 'user', content: [{ text: message }] },
    ];

    // Initial invocation
    let response = await this.callBedrock(messages);
    let responseText = '';

    // Handle tool-use loop (agent may call multiple tools)
    while (true) {
      const { text, toolUseBlocks, stopReason } = this.parseResponse(response);
      responseText += text;

      if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
        break;
      }

      // Process each tool use block
      const toolResults: ContentBlock[] = [];
      for (const toolUse of toolUseBlocks) {
        const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;
        let toolOutput: Record<string, unknown> = {};

        if (this.toolDispatcher) {
          toolOutput = await this.toolDispatcher.dispatch(
            toolUse.name!,
            toolInput
          );
        }

        toolCalls.push({
          tool: toolUse.name!,
          input: toolInput,
          output: toolOutput,
        });

        toolResults.push({
          toolResult: {
            toolUseId: toolUse.toolUseId,
            content: [{ json: toolOutput } as ToolResultContentBlock],
          },
        });
      }

      // Append assistant response and tool results to messages
      messages.push({
        role: 'assistant',
        content: response.output?.message?.content ?? [],
      });
      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Continue the conversation with tool results
      response = await this.callBedrock(messages);
    }

    // Enforce one-question-per-turn constraint
    responseText = enforceOneQuestion(responseText.trim());

    // Extract confidence and determine action
    const confidence = extractConfidence(responseText, toolCalls);
    const action = toolCalls.length > 0 ? routeAction(confidence) : undefined;

    // Extract product cards from tool outputs
    const products = extractProductCards(toolCalls);

    return {
      content: responseText,
      products: products.length > 0 ? products : undefined,
      action,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private async callBedrock(
    messages: BedrockMessage[]
  ): Promise<ConverseCommandOutput> {
    const input: ConverseCommandInput = {
      modelId: this.modelId,
      system: [{ text: SYSTEM_PROMPT }],
      messages,
      toolConfig: TOOL_DEFINITIONS,
    };

    const command = new ConverseCommand(input);
    return this.client.send(command);
  }

  private parseResponse(response: ConverseCommandOutput): {
    text: string;
    toolUseBlocks: Array<{
      toolUseId: string | undefined;
      name: string | undefined;
      input: unknown;
    }>;
    stopReason: string | undefined;
  } {
    const content = response.output?.message?.content ?? [];
    let text = '';
    const toolUseBlocks: Array<{
      toolUseId: string | undefined;
      name: string | undefined;
      input: unknown;
    }> = [];

    for (const block of content) {
      if (block.text) {
        text += block.text;
      }
      if (block.toolUse) {
        toolUseBlocks.push({
          toolUseId: block.toolUse.toolUseId,
          name: block.toolUse.name,
          input: block.toolUse.input,
        });
      }
    }

    return { text, toolUseBlocks, stopReason: response.stopReason };
  }
}
