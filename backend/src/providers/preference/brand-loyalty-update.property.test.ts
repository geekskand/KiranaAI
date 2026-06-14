/**
 * Property-Based Test: Brand Loyalty Score Update (Property 5)
 *
 * Tests that for any purchase confirmation or recommendation acceptance event,
 * the brand loyalty score for the corresponding category and brand SHALL increase
 * from its prior value.
 *
 * **Validates: Requirements 2.2**
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalJsonPreferenceStore } from './local-json.js';

const TEST_DIR = join(process.cwd(), 'tmp-pbt-brand-loyalty');
let testFileCounter = 0;

function freshTestFile(): string {
  testFileCounter++;
  return join(TEST_DIR, `pbt-brand-loyalty-${testFileCounter}-${Date.now()}.json`);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// UserId: simple alphanumeric strings
const userIdArb = fc.stringMatching(/^[a-z][a-z0-9]{2,12}$/);

// Category and brand names: alphanumeric strings to avoid issues with # delimiter in SK
const categoryNameArb = fc.stringMatching(/^[a-z][a-z0-9]{1,12}$/);
const brandNameArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{1,12}$/);

// Positive delta simulating a purchase/acceptance event (must be > 0)
const positiveDeltaArb = fc.integer({ min: 1, max: 50 });

// Initial score that leaves room for increase (clamped at 100)
const initialScoreArb = fc.integer({ min: 0, max: 99 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 5: Brand Loyalty Score Update', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('purchase/acceptance events with positive delta increase the brand loyalty score from its prior value', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        categoryNameArb,
        brandNameArb,
        initialScoreArb,
        positiveDeltaArb,
        async (userId, category, brand, initialScore, scoreDelta) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);

          // Set up initial brand loyalty score
          if (initialScore > 0) {
            await store.updateBrandLoyalty(userId, category, brand, initialScore);
          }

          // Read the score before the purchase event
          const profileBefore = await store.getUserProfile(userId);
          const scoreBefore = profileBefore
            ? (profileBefore.brandLoyalty.find(
                (b) => b.category === category && b.brand === brand
              )?.score ?? 0)
            : 0;

          // Simulate a purchase/acceptance event by applying a positive delta
          await store.updateBrandLoyalty(userId, category, brand, scoreDelta);

          // Read the score after the event
          const profileAfter = await store.getUserProfile(userId);
          expect(profileAfter).not.toBeNull();

          const entryAfter = profileAfter!.brandLoyalty.find(
            (b) => b.category === category && b.brand === brand
          );
          expect(entryAfter).toBeDefined();

          const scoreAfter = entryAfter!.score;

          // The score SHALL increase from its prior value (unless already at max 100)
          if (scoreBefore < 100) {
            expect(scoreAfter).toBeGreaterThan(scoreBefore);
          } else {
            // If already at 100, it remains at 100 (clamped)
            expect(scoreAfter).toBe(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple sequential purchase events each increase or maintain (at cap) the brand loyalty score', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        categoryNameArb,
        brandNameArb,
        fc.array(positiveDeltaArb, { minLength: 1, maxLength: 5 }),
        async (userId, category, brand, deltas) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);

          let previousScore = 0;

          for (const delta of deltas) {
            // Apply purchase event
            await store.updateBrandLoyalty(userId, category, brand, delta);

            // Read current score
            const profile = await store.getUserProfile(userId);
            expect(profile).not.toBeNull();

            const entry = profile!.brandLoyalty.find(
              (b) => b.category === category && b.brand === brand
            );
            expect(entry).toBeDefined();

            const currentScore = entry!.score;

            // Score should increase or stay at 100 (clamped ceiling)
            if (previousScore < 100) {
              expect(currentScore).toBeGreaterThan(previousScore);
            } else {
              expect(currentScore).toBe(100);
            }

            previousScore = currentScore;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('brand loyalty update only affects the targeted category/brand combination', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        categoryNameArb,
        categoryNameArb,
        brandNameArb,
        brandNameArb,
        positiveDeltaArb,
        async (userId, category1, category2, brand1, brand2, delta) => {
          // Ensure the two category/brand combos are different
          if (category1 === category2 && brand1 === brand2) return;

          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);

          // Set up initial scores for both combinations
          await store.updateBrandLoyalty(userId, category1, brand1, 30);
          await store.updateBrandLoyalty(userId, category2, brand2, 40);

          // Read score for combo2 before the event
          const profileBefore = await store.getUserProfile(userId);
          const combo2Before = profileBefore!.brandLoyalty.find(
            (b) => b.category === category2 && b.brand === brand2
          )!.score;

          // Apply purchase event only on combo1
          await store.updateBrandLoyalty(userId, category1, brand1, delta);

          // combo2 should remain unchanged
          const profileAfter = await store.getUserProfile(userId);
          const combo2After = profileAfter!.brandLoyalty.find(
            (b) => b.category === category2 && b.brand === brand2
          )!.score;

          expect(combo2After).toBe(combo2Before);
        }
      ),
      { numRuns: 50 }
    );
  });
});
