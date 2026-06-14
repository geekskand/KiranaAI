/**
 * Property-Based Test: Preference Data Isolation (Property 19)
 *
 * Tests that for any authenticated user A, querying the Preference Graph
 * with user A's credentials SHALL never return preference data belonging
 * to a different user B.
 *
 * **Validates: Requirements 15.3**
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalJsonPreferenceStore } from './local-json.js';
import { generateLocalToken, validateLocalToken } from '../../middleware/auth-local.js';
import type { DietaryFlag } from '../../models/types.js';

const TEST_DIR = join(process.cwd(), 'tmp-pbt-isolation');
let testFileCounter = 0;

function freshTestFile(): string {
  testFileCounter++;
  return join(TEST_DIR, `pbt-isolation-${testFileCounter}-${Date.now()}.json`);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate distinct user IDs (alphanumeric, non-empty) */
const userIdArb = fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/);

/** Generate a pair of distinct user IDs */
const distinctUserPairArb = fc
  .tuple(userIdArb, userIdArb)
  .filter(([a, b]) => a !== b);

const dietaryFlagArb: fc.Arbitrary<DietaryFlag> = fc.oneof(
  fc.constant('vegetarian' as DietaryFlag),
  fc.constant('vegan' as DietaryFlag),
  fc.constant('gluten-free' as DietaryFlag),
  fc.constant('dairy-free' as DietaryFlag),
  fc.constant('low-sugar' as DietaryFlag),
  fc.constant('organic-only' as DietaryFlag)
);

const categoryNameArb = fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/);
const brandNameArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{1,8}$/);

/** Preference data to seed for a user */
const preferenceDataArb = fc.record({
  dietaryFlags: fc.uniqueArray(dietaryFlagArb, { minLength: 1, maxLength: 4 }),
  brandEntries: fc.array(
    fc.record({
      category: categoryNameArb,
      brand: brandNameArb,
      score: fc.integer({ min: 1, max: 100 }),
    }),
    { minLength: 1, maxLength: 4 }
  ),
});

// ─── Helper: Simulates authenticated preference access ───────────────────────

/**
 * Simulates the full flow of:
 * 1. Authenticating with a token
 * 2. Extracting userId from the token
 * 3. Querying the preference store with that userId
 *
 * This mirrors how the system works: auth middleware extracts userId from token,
 * then preference store is queried with that userId.
 */
async function authenticatedGetUserProfile(
  token: string,
  store: LocalJsonPreferenceStore
) {
  const authResult = validateLocalToken(token);
  if (!authResult) {
    return { authenticated: false as const, profile: null };
  }
  // The system uses the extracted userId to query the preference store
  const profile = await store.getUserProfile(authResult.userId);
  return { authenticated: true as const, userId: authResult.userId, profile };
}

async function authenticatedGetPreferences(
  token: string,
  store: LocalJsonPreferenceStore,
  category: string
) {
  const authResult = validateLocalToken(token);
  if (!authResult) {
    return { authenticated: false as const, prefs: null };
  }
  const prefs = await store.getPreferences(authResult.userId, category);
  return { authenticated: true as const, userId: authResult.userId, prefs };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 19: Preference Data Isolation', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('user A credentials never return user B profile data', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctUserPairArb,
        preferenceDataArb,
        preferenceDataArb,
        async ([userIdA, userIdB], dataA, dataB) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);

          // Seed data for user A
          for (const flag of dataA.dietaryFlags) {
            await store.setDietaryFlag(userIdA, flag);
          }
          for (const entry of dataA.brandEntries) {
            await store.updateBrandLoyalty(userIdA, entry.category, entry.brand, entry.score);
          }

          // Seed data for user B
          for (const flag of dataB.dietaryFlags) {
            await store.setDietaryFlag(userIdB, flag);
          }
          for (const entry of dataB.brandEntries) {
            await store.updateBrandLoyalty(userIdB, entry.category, entry.brand, entry.score);
          }

          // Authenticate as user A
          const tokenA = generateLocalToken(userIdA);
          const resultA = await authenticatedGetUserProfile(tokenA, store);

          expect(resultA.authenticated).toBe(true);
          if (!resultA.authenticated) return;

          // User A should get their own profile
          expect(resultA.userId).toBe(userIdA);
          expect(resultA.profile).not.toBeNull();
          expect(resultA.profile!.userId).toBe(userIdA);

          // User A's profile should NOT contain user B's dietary flags
          // (unless they happen to overlap by coincidence — check userId identity)
          expect(resultA.profile!.userId).not.toBe(userIdB);

          // Verify user A's dietary flags match what was seeded for A, not B
          const expectedFlagsA = [...new Set(dataA.dietaryFlags)].sort();
          expect(resultA.profile!.dietaryFlags.slice().sort()).toEqual(expectedFlagsA);

          // Verify user A's brand loyalty entries belong to user A's seed data
          for (const entry of resultA.profile!.brandLoyalty) {
            // Each brand loyalty entry should correspond to something seeded for A
            const matchesA = dataA.brandEntries.some(
              (e) => e.category === entry.category && e.brand === entry.brand
            );
            expect(matchesA).toBe(true);
          }

          // Now authenticate as user B and verify isolation in reverse
          const tokenB = generateLocalToken(userIdB);
          const resultB = await authenticatedGetUserProfile(tokenB, store);

          expect(resultB.authenticated).toBe(true);
          if (!resultB.authenticated) return;

          expect(resultB.userId).toBe(userIdB);
          expect(resultB.profile).not.toBeNull();
          expect(resultB.profile!.userId).toBe(userIdB);

          // Verify user B's dietary flags match what was seeded for B
          const expectedFlagsB = [...new Set(dataB.dietaryFlags)].sort();
          expect(resultB.profile!.dietaryFlags.slice().sort()).toEqual(expectedFlagsB);

          // Verify user B's brand loyalty entries belong to user B's seed data
          for (const entry of resultB.profile!.brandLoyalty) {
            const matchesB = dataB.brandEntries.some(
              (e) => e.category === entry.category && e.brand === entry.brand
            );
            expect(matchesB).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('user A credentials querying category preferences never returns user B preferred brands', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctUserPairArb,
        categoryNameArb,
        fc.array(
          fc.record({ brand: brandNameArb, score: fc.integer({ min: 51, max: 100 }) }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.array(
          fc.record({ brand: brandNameArb, score: fc.integer({ min: 51, max: 100 }) }),
          { minLength: 1, maxLength: 3 }
        ),
        async ([userIdA, userIdB], category, brandsA, brandsB) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);

          // Seed brand loyalty for user A in the given category
          for (const entry of brandsA) {
            await store.updateBrandLoyalty(userIdA, category, entry.brand, entry.score);
          }

          // Seed brand loyalty for user B in the same category
          for (const entry of brandsB) {
            await store.updateBrandLoyalty(userIdB, category, entry.brand, entry.score);
          }

          // Authenticate as user A and query category preferences
          const tokenA = generateLocalToken(userIdA);
          const resultA = await authenticatedGetPreferences(tokenA, store, category);

          expect(resultA.authenticated).toBe(true);
          if (!resultA.authenticated) return;

          expect(resultA.userId).toBe(userIdA);

          // User A's preferred brands should only come from brands seeded for A
          const seedBrandsA = new Set(brandsA.map((b) => b.brand));
          for (const brand of resultA.prefs!.preferredBrands) {
            expect(seedBrandsA.has(brand)).toBe(true);
          }

          // Authenticate as user B and query category preferences
          const tokenB = generateLocalToken(userIdB);
          const resultB = await authenticatedGetPreferences(tokenB, store, category);

          expect(resultB.authenticated).toBe(true);
          if (!resultB.authenticated) return;

          expect(resultB.userId).toBe(userIdB);

          // User B's preferred brands should only come from brands seeded for B
          const seedBrandsB = new Set(brandsB.map((b) => b.brand));
          for (const brand of resultB.prefs!.preferredBrands) {
            expect(seedBrandsB.has(brand)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('a token for user A cannot retrieve user B data even when both exist in the store', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctUserPairArb,
        dietaryFlagArb,
        dietaryFlagArb,
        async ([userIdA, userIdB], flagA, flagB) => {
          const filePath = freshTestFile();
          const store = new LocalJsonPreferenceStore(filePath);

          // Seed distinct dietary flags for each user
          await store.setDietaryFlag(userIdA, flagA);
          await store.setDietaryFlag(userIdB, flagB);

          // Authenticate as user A
          const tokenA = generateLocalToken(userIdA);
          const authResult = validateLocalToken(tokenA);
          expect(authResult).not.toBeNull();
          expect(authResult!.userId).toBe(userIdA);

          // Query profile using the authenticated userId
          const profileA = await store.getUserProfile(authResult!.userId);
          expect(profileA).not.toBeNull();
          expect(profileA!.userId).toBe(userIdA);

          // Profile returned for user A is NOT user B's profile
          expect(profileA!.userId).not.toBe(userIdB);

          // If the flags are different, verify user A doesn't have B's unique flag
          if (flagA !== flagB) {
            // User A's profile should contain flagA
            expect(profileA!.dietaryFlags).toContain(flagA);
            // User A's profile should NOT contain flagB (since they're different)
            expect(profileA!.dietaryFlags).not.toContain(flagB);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
