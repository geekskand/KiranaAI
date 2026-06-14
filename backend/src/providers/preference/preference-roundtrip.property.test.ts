/**
 * Property-Based Test: Preference Graph Round-Trip (Property 3)
 *
 * Tests that any valid user profile data written to the LocalJsonPreferenceStore
 * can be read back with identical values.
 *
 * **Validates: Requirements 2.1, 2.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalJsonPreferenceStore } from './local-json.js';
import type { DietaryFlag } from '../../models/types.js';

const TEST_DIR = join(process.cwd(), 'tmp-pbt-preference');
let testFileCounter = 0;

function freshTestFile(): string {
  testFileCounter++;
  return join(TEST_DIR, `pbt-prefs-${testFileCounter}-${Date.now()}.json`);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const dietaryFlagArb: fc.Arbitrary<DietaryFlag> = fc.oneof(
  fc.constant('vegetarian' as DietaryFlag),
  fc.constant('vegan' as DietaryFlag),
  fc.constant('gluten-free' as DietaryFlag),
  fc.constant('dairy-free' as DietaryFlag),
  fc.constant('low-sugar' as DietaryFlag),
  fc.constant('organic-only' as DietaryFlag)
);

const dietaryFlagsArb: fc.Arbitrary<DietaryFlag[]> = fc
  .uniqueArray(dietaryFlagArb, { minLength: 0, maxLength: 6 })
  .map((flags) => [...flags]);

// Category and brand names: alphanumeric strings to avoid issues with # delimiter in SK
const categoryNameArb = fc.stringMatching(/^[a-z][a-z0-9]{1,12}$/);
const brandNameArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{1,12}$/);

const brandLoyaltyEntryArb = fc.record({
  category: categoryNameArb,
  brand: brandNameArb,
  score: fc.integer({ min: 0, max: 100 }),
});

const toleranceLevelArb = fc.oneof(
  fc.constant('strict' as const),
  fc.constant('moderate' as const),
  fc.constant('flexible' as const)
);

const qualityPreferenceArb = fc.record({
  category: categoryNameArb,
  toleranceLevel: toleranceLevelArb,
  priceWeight: fc.double({ min: 0, max: 1, noNaN: true }),
  brandWeight: fc.double({ min: 0, max: 1, noNaN: true }),
});

// Full profile data for writing
const userProfileDataArb = fc.record({
  dietaryFlags: dietaryFlagsArb,
  brandLoyalty: fc.array(brandLoyaltyEntryArb, { minLength: 0, maxLength: 5 }),
  qualityPreferences: fc.array(qualityPreferenceArb, { minLength: 0, maxLength: 5 }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 3: Preference Graph Round-Trip', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('any valid user profile data written to LocalJsonPreferenceStore can be read back with identical values', async () => {
    await fc.assert(
      fc.asyncProperty(userProfileDataArb, async (profileData) => {
        const filePath = freshTestFile();
        const store = new LocalJsonPreferenceStore(filePath);
        const userId = 'roundtrip-user';

        // Write dietary flags
        for (const flag of profileData.dietaryFlags) {
          await store.setDietaryFlag(userId, flag);
        }

        // Write brand loyalty entries — use score directly as delta for fresh entries
        for (const entry of profileData.brandLoyalty) {
          await store.updateBrandLoyalty(userId, entry.category, entry.brand, entry.score);
        }

        // Write quality preferences by writing to the store's internal structure
        // Since the public API doesn't have a direct setQualityPreference method,
        // we need to verify the round-trip for what the API supports:
        // dietary flags and brand loyalty scores.

        // If no data was written, profile should be null only if all arrays are empty
        if (
          profileData.dietaryFlags.length === 0 &&
          profileData.brandLoyalty.length === 0
        ) {
          const profile = await store.getUserProfile(userId);
          // No writes happened, profile may or may not exist
          // (updateBrandLoyalty and setDietaryFlag both create profile)
          expect(profile).toBeNull();
          return;
        }

        // Read back the full profile
        const profile = await store.getUserProfile(userId);
        expect(profile).not.toBeNull();
        expect(profile!.userId).toBe(userId);

        // Verify dietary flags round-trip
        const expectedFlags = [...new Set(profileData.dietaryFlags)];
        expect(profile!.dietaryFlags.slice().sort()).toEqual(expectedFlags.slice().sort());

        // Verify brand loyalty round-trip
        // When multiple entries share the same category+brand, scores accumulate (clamped 0-100)
        const expectedScores = new Map<string, number>();
        for (const entry of profileData.brandLoyalty) {
          const key = `${entry.category}#${entry.brand}`;
          const current = expectedScores.get(key) ?? 0;
          expectedScores.set(key, Math.max(0, Math.min(100, current + entry.score)));
        }

        expect(profile!.brandLoyalty).toHaveLength(expectedScores.size);

        for (const [key, expectedScore] of expectedScores) {
          const [category, brand] = key.split('#');
          const found = profile!.brandLoyalty.find(
            (b) => b.category === category && b.brand === brand
          );
          expect(found).toBeDefined();
          expect(found!.score).toBe(expectedScore);
          expect(found!.category).toBe(category);
          expect(found!.brand).toBe(brand);
        }

        // Verify timestamps exist and are positive
        expect(profile!.createdAt).toBeGreaterThan(0);
        expect(profile!.updatedAt).toBeGreaterThanOrEqual(profile!.createdAt);
      }),
      { numRuns: 50 }
    );
  });

  it('dietary flags persist without duplication across multiple writes', async () => {
    await fc.assert(
      fc.asyncProperty(
        dietaryFlagsArb,
        fc.integer({ min: 1, max: 3 }),
        async (flags, repetitions) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);
          const userId = 'dedup-user';

          if (flags.length === 0) return;

          // Write same flags multiple times
          for (let i = 0; i < repetitions; i++) {
            for (const flag of flags) {
              await store.setDietaryFlag(userId, flag);
            }
          }

          const profile = await store.getUserProfile(userId);
          expect(profile).not.toBeNull();

          // Each unique flag should appear exactly once
          const uniqueFlags = [...new Set(flags)];
          expect(profile!.dietaryFlags).toHaveLength(uniqueFlags.length);
          expect(profile!.dietaryFlags.slice().sort()).toEqual(uniqueFlags.slice().sort());
        }
      ),
      { numRuns: 50 }
    );
  });

  it('brand loyalty scores are clamped to [0, 100] for any sequence of deltas', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryNameArb,
        brandNameArb,
        fc.array(fc.integer({ min: -100, max: 100 }), { minLength: 1, maxLength: 5 }),
        async (category, brand, deltas) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);
          const userId = 'clamp-user';

          for (const delta of deltas) {
            await store.updateBrandLoyalty(userId, category, brand, delta);
          }

          const profile = await store.getUserProfile(userId);
          expect(profile).not.toBeNull();

          const entry = profile!.brandLoyalty.find(
            (b) => b.category === category && b.brand === brand
          );
          expect(entry).toBeDefined();
          expect(entry!.score).toBeGreaterThanOrEqual(0);
          expect(entry!.score).toBeLessThanOrEqual(100);

          // Verify the score matches the expected accumulated and clamped value
          let expected = 0;
          for (const delta of deltas) {
            expected = Math.max(0, Math.min(100, expected + delta));
          }
          expect(entry!.score).toBe(expected);
        }
      ),
      { numRuns: 50 }
    );
  });
});
