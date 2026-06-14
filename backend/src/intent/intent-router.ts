/**
 * Intent Router — understands what the user actually wants.
 *
 * Produces an UnderstoodIntent (kind + entity + confidence) that drives the
 * rest of the pipeline. Resolves session references like "the second one".
 */

import type { UnderstoodIntent, IntentKind } from './types.js';
import { sessionRag } from './rag/session-rag.js';

interface Pattern {
  kind: IntentKind;
  re: RegExp;
  confidence: number;
}

const PATTERNS: Pattern[] = [
  { kind: 'greeting', re: /^\s*(?:hi|hello|hey|namaste|good (?:morning|evening|afternoon)|howdy)\b/i, confidence: 0.95 },
  { kind: 'help', re: /\b(?:help|what can you do|how do you work|what do you do|features|commands)\b/i, confidence: 0.9 },
  { kind: 'plan', re: /\b(?:plan|weekly groceries|next week|monthly|usual basket|my usual|stock up|grocery list)\b/i, confidence: 0.85 },
  { kind: 'remove', re: /\b(?:remove|delete|take out|drop|cancel)\b/i, confidence: 0.88 },
  { kind: 'substitute', re: /\b(?:substitute|alternative|replace|instead of|similar to|something like|other option|swap)\b/i, confidence: 0.85 },
  { kind: 'add', re: /\b(?:add|buy|put in cart|i'll take|i will take|order)\b/i, confidence: 0.88 },
  { kind: 'question', re: /\b(?:without|free of|free from|no |contains|is there|which|safe for|good for|suitable)\b/i, confidence: 0.7 },
  { kind: 'search', re: /\b(?:find|show me|show|looking for|search|i need|need|i want|want|where is|do you have|get me|gimme|give me)\b/i, confidence: 0.82 },
];

const KEYWORD_STRIP = /\b(?:find|show me|show|looking for|search for|search|i need|need|i want|want|where is|do you have|get me some|get me|gimme|give me|add|buy|put in cart|to (?:my )?cart|i'll take|i will take|order|substitute for|substitute|alternative to|alternative|replace|instead of|similar to|something like|other option|swap|remove|delete|take out|drop|cancel|any|some|please)\b/gi;

function extractEntity(text: string): string | undefined {
  const cleaned = text.replace(KEYWORD_STRIP, '').replace(/[?.!,]/g, '').trim();
  return cleaned.length > 1 ? cleaned : undefined;
}

export function understand(message: string, sessionId?: string): UnderstoodIntent {
  const raw = message.trim();
  if (!raw) return { kind: 'unknown', confidence: 0, rawText: message };

  for (const p of PATTERNS) {
    if (p.re.test(raw)) {
      let entity = extractEntity(raw);

      // Resolve session references for remove/add ("the second one")
      if (!entity && sessionId && (p.kind === 'remove' || p.kind === 'add')) {
        const ref = sessionRag.resolveReference(sessionId, raw);
        if (ref) entity = ref.name;
      }

      let confidence = p.confidence;
      if (entity) confidence = Math.min(confidence + 0.05, 1);
      return { kind: p.kind, entity, confidence, rawText: raw };
    }
  }

  // No keyword matched — treat the whole message as a potential product search
  return { kind: 'search', entity: raw, confidence: 0.4, rawText: raw };
}
