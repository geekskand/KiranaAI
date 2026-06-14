/**
 * KiranaAI Seed Script
 *
 * Runnable script to populate the product catalog, co-occurrence rules,
 * and persona profiles into the preference store and cache.
 *
 * Supports both DynamoDB (if available) and local JSON fallback via
 * the provider pattern. Detects environment from KIRANA_ENV variable.
 *
 * Usage: npm run seed
 *
 * Requirements: 10.1, 10.4
 */

import { LocalJsonPreferenceStore } from '../providers/preference/local-json.js';
import { InMemoryCacheProvider } from '../providers/cache/in-memory.js';
import { catalog, coOccurrenceRules } from './catalog.js';
import { demoPersonas } from './personas.js';
import type { PreferenceStoreProvider } from '../providers/interfaces.js';
import type { CacheProvider } from '../providers/interfaces.js';

// ─── Environment Detection ───────────────────────────────────────────────────

type Environment = 'LOCAL' | 'DEV' | 'PROD';

function getEnvironment(): Environment {
  return (process.env['KIRANA_ENV'] as Environment) ?? 'LOCAL';
}

// ─── Provider Setup ──────────────────────────────────────────────────────────

interface SeedProviders {
  preferenceStore: PreferenceStoreProvider;
  cache: CacheProvider;
}

async function createProviders(env: Environment): Promise<SeedProviders> {
  if (env === 'LOCAL') {
    console.log('  Environment: LOCAL — using JSON file store and in-memory cache');
    return {
      preferenceStore: new LocalJsonPreferenceStore('data/preferences.json'),
      cache: new InMemoryCacheProvider(),
    };
  }

  // For DEV/PROD, attempt DynamoDB — fall back to local if unavailable
  console.log(`  Environment: ${env} — attempting DynamoDB connection...`);
  try {
    const { DynamoDBPreferenceStore } = await import(
      '../providers/preference/dynamodb.js'
    );
    const tableName = process.env['DYNAMODB_TABLE'] ?? 'KiranaAI';
    const endpoint = process.env['DYNAMODB_ENDPOINT'];
    return {
      preferenceStore: new DynamoDBPreferenceStore({
        tableName,
        ...(endpoint ? { endpoint } : {}),
      }),
      cache: new InMemoryCacheProvider(), // Cache is always in-memory for seeding
    };
  } catch (error) {
    console.warn('  ⚠ DynamoDB unavailable, falling back to local JSON store');
    return {
      preferenceStore: new LocalJsonPreferenceStore('data/preferences.json'),
      cache: new InMemoryCacheProvider(),
    };
  }
}

// ─── Seed Functions ──────────────────────────────────────────────────────────

async function seedProducts(cache: CacheProvider): Promise<void> {
  console.log(`\n📦 Seeding ${catalog.length} products into product catalog...`);

  for (const product of catalog) {
    // Store each product in the cache with a long TTL (1 hour for seed data)
    await cache.set(`product:${product.productId}`, product, 3600);
  }

  // Also store the full catalog index for quick lookups
  await cache.set(
    'catalog:all',
    catalog.map((p) => ({
      productId: p.productId,
      name: p.name,
      brand: p.brand,
      category: p.category,
      price: p.price,
      labels: p.labels,
    })),
    3600
  );

  console.log(`  ✓ ${catalog.length} products seeded successfully`);
}

async function seedCoOccurrenceRules(cache: CacheProvider): Promise<void> {
  console.log(
    `\n🔗 Seeding ${coOccurrenceRules.length} co-occurrence rules for basket completion...`
  );

  for (const rule of coOccurrenceRules) {
    await cache.set(`cooccur:${rule.triggerProductId}`, rule.companions, 3600);
  }

  // Store a rule index for quick existence checks
  await cache.set(
    'cooccur:index',
    coOccurrenceRules.map((r) => r.triggerProductId),
    3600
  );

  console.log(`  ✓ ${coOccurrenceRules.length} co-occurrence rules seeded successfully`);
}

async function seedPersonaProfiles(
  preferenceStore: PreferenceStoreProvider
): Promise<void> {
  console.log(
    `\n👤 Seeding ${demoPersonas.length} persona profiles into preference graph...`
  );

  for (const persona of demoPersonas) {
    console.log(`  → Seeding persona: ${persona.userId}`);

    // Seed dietary flags
    for (const flag of persona.dietaryFlags) {
      await preferenceStore.setDietaryFlag(persona.userId, flag);
    }

    // Seed brand loyalty scores
    for (const entry of persona.brandLoyalty) {
      await preferenceStore.updateBrandLoyalty(
        persona.userId,
        entry.category,
        entry.brand,
        entry.score // Use the score directly as delta (starts from 0)
      );
    }

    console.log(
      `    ✓ ${persona.dietaryFlags.length} dietary flags, ${persona.brandLoyalty.length} brand loyalty entries`
    );
  }

  console.log(`  ✓ All persona profiles seeded successfully`);
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       KiranaAI — Seed Script            ║');
  console.log('╚══════════════════════════════════════════╝');

  const env = getEnvironment();
  let providers: SeedProviders;

  try {
    providers = await createProviders(env);
  } catch (error) {
    console.error('✗ Failed to initialize providers:', error);
    process.exit(1);
  }

  try {
    // Step 1: Seed products
    await seedProducts(providers.cache);
  } catch (error) {
    console.error('✗ Failed to seed products:', error);
    process.exit(1);
  }

  try {
    // Step 2: Seed co-occurrence rules
    await seedCoOccurrenceRules(providers.cache);
  } catch (error) {
    console.error('✗ Failed to seed co-occurrence rules:', error);
    process.exit(1);
  }

  try {
    // Step 3: Seed persona profiles
    await seedPersonaProfiles(providers.preferenceStore);
  } catch (error) {
    console.error('✗ Failed to seed persona profiles:', error);
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════');
  console.log('✓ Done! All seed data populated successfully.');
  console.log('══════════════════════════════════════════\n');
}

// Run the seed script
main().catch((error) => {
  console.error('✗ Unexpected error during seeding:', error);
  process.exit(1);
});
