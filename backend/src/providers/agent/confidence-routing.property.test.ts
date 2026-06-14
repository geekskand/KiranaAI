/**
 * Property-Based Test: Confidence-Based Action Routing (Property 8)
 *
 * For any product recommendation with a computed confidence score, the agent SHALL:
 * - Auto-add when score > 0.85
 * - Suggest-and-confirm when 0.55 ≤ score ≤ 0.85
 * - Present a shortlist when score < 0.55
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { routeAction } from './bedrock.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary confidence score: float between 0 and 1 (inclusive) */
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true });

/** High confidence: strictly above 0.85 */
const highConfidenceArb = fc.double({ min: 0.850001, max: 1, noNaN: true });

/** Medium confidence: between 0.55 (inclusive) and 0.85 (inclusive) */
const mediumConfidenceArb = fc.double({ min: 0.55, max: 0.85, noNaN: true });

/** Low confidence: strictly below 0.55 */
const lowConfidenceArb = fc.double({ min: 0, max: 0.549999, noNaN: true });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 8: Confidence-Based Action Routing', () => {
  it('confidence > 0.85 always routes to auto-added', () => {
    fc.assert(
      fc.property(highConfidenceArb, (confidence) => {
        const action = routeAction(confidence);
        expect(action).toBe('auto-added');
      }),
      { numRuns: 500 }
    );
  });

  it('confidence between 0.55 and 0.85 (inclusive) always routes to suggest', () => {
    fc.assert(
      fc.property(mediumConfidenceArb, (confidence) => {
        const action = routeAction(confidence);
        expect(action).toBe('suggest');
      }),
      { numRuns: 500 }
    );
  });

  it('confidence < 0.55 always routes to shortlist', () => {
    fc.assert(
      fc.property(lowConfidenceArb, (confidence) => {
        const action = routeAction(confidence);
        expect(action).toBe('shortlist');
      }),
      { numRuns: 500 }
    );
  });

  it('any confidence score in [0,1] maps to exactly one of the three actions', () => {
    fc.assert(
      fc.property(confidenceArb, (confidence) => {
        const action = routeAction(confidence);
        expect(['auto-added', 'suggest', 'shortlist']).toContain(action);
      }),
      { numRuns: 1000 }
    );
  });

  it('boundary: 0.85 exactly routes to suggest (not auto-added)', () => {
    const action = routeAction(0.85);
    expect(action).toBe('suggest');
  });

  it('boundary: 0.55 exactly routes to suggest (not shortlist)', () => {
    const action = routeAction(0.55);
    expect(action).toBe('suggest');
  });

  it('boundary: value just above 0.85 routes to auto-added', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.8500001, max: 0.86, noNaN: true }),
        (confidence) => {
          const action = routeAction(confidence);
          expect(action).toBe('auto-added');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: value just below 0.55 routes to shortlist', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.54, max: 0.5499999, noNaN: true }),
        (confidence) => {
          const action = routeAction(confidence);
          expect(action).toBe('shortlist');
        }
      ),
      { numRuns: 100 }
    );
  });
});
