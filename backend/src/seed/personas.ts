/**
 * Persona seed data for Segment A (budget optimizer) and Segment B (health-conscious).
 * Pre-populates Preference_Graph entries for both personas to demonstrate
 * cold-start bypass and distinct recommendation behaviors.
 *
 * Requirements: 10.2, 10.3, 10.4
 */

import type { UserProfile, BrandLoyaltyEntry, QualityPreference, DietaryFlag } from '../models/types';

// ─── Segment A: Budget Optimizer ("Rahul") ───────────────────────────────────

const rahulDietaryFlags: DietaryFlag[] = ['vegetarian'];

const rahulBrandLoyalty: BrandLoyaltyEntry[] = [
  // Value brands preferred across most categories
  { category: 'cooking-oil', brand: 'Fortune', score: 85, lastUpdated: Date.now() },
  { category: 'rice', brand: 'India Gate', score: 78, lastUpdated: Date.now() },
  { category: 'atta', brand: 'Aashirvaad', score: 72, lastUpdated: Date.now() },
  { category: 'spices', brand: 'Tata', score: 80, lastUpdated: Date.now() },
  { category: 'tea', brand: 'Tata Tea', score: 75, lastUpdated: Date.now() },
  // Brand-fixed for milk — won't accept substitutes
  { category: 'milk', brand: 'Amul', score: 95, lastUpdated: Date.now() },
  { category: 'snacks', brand: 'Parle', score: 70, lastUpdated: Date.now() },
];

const rahulQualityPreferences: QualityPreference[] = [
  // High priceWeight = prioritizes cheapest options; low brandWeight = flexible on brand
  { category: 'cooking-oil', toleranceLevel: 'flexible', priceWeight: 0.85, brandWeight: 0.25 },
  { category: 'rice', toleranceLevel: 'flexible', priceWeight: 0.80, brandWeight: 0.30 },
  { category: 'atta', toleranceLevel: 'flexible', priceWeight: 0.82, brandWeight: 0.28 },
  { category: 'spices', toleranceLevel: 'flexible', priceWeight: 0.80, brandWeight: 0.25 },
  { category: 'tea', toleranceLevel: 'moderate', priceWeight: 0.75, brandWeight: 0.30 },
  // Strict on milk — brand-fixed, won't accept cheap substitutes
  { category: 'milk', toleranceLevel: 'strict', priceWeight: 0.30, brandWeight: 0.90 },
  { category: 'snacks', toleranceLevel: 'flexible', priceWeight: 0.85, brandWeight: 0.20 },
];

export const personaBudgetRahul: UserProfile = {
  userId: 'persona-budget-rahul',
  dietaryFlags: rahulDietaryFlags,
  brandLoyalty: rahulBrandLoyalty,
  qualityPreferences: rahulQualityPreferences,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ─── Segment B: Health-Conscious ("Priya") ───────────────────────────────────

const priyaDietaryFlags: DietaryFlag[] = ['vegetarian', 'organic-only', 'low-sugar'];

const priyaBrandLoyalty: BrandLoyaltyEntry[] = [
  // Organic/health brands preferred
  { category: 'cooking-oil', brand: 'Patanjali Organic', score: 90, lastUpdated: Date.now() },
  { category: 'rice', brand: 'Organic Tattva', score: 88, lastUpdated: Date.now() },
  { category: 'atta', brand: 'Patanjali Organic', score: 85, lastUpdated: Date.now() },
  { category: 'honey', brand: 'Dabur Organic', score: 92, lastUpdated: Date.now() },
  { category: 'tea', brand: 'Organic India', score: 87, lastUpdated: Date.now() },
  { category: 'milk', brand: 'Amul Organic', score: 90, lastUpdated: Date.now() },
  { category: 'snacks', brand: 'Yoga Bar', score: 82, lastUpdated: Date.now() },
];

const priyaQualityPreferences: QualityPreference[] = [
  // Low priceWeight = not price-sensitive; high brandWeight = loyal to health brands
  // Strict tolerance = blocks non-organic/non-health substitutes
  { category: 'cooking-oil', toleranceLevel: 'strict', priceWeight: 0.20, brandWeight: 0.85 },
  { category: 'rice', toleranceLevel: 'strict', priceWeight: 0.25, brandWeight: 0.80 },
  { category: 'atta', toleranceLevel: 'strict', priceWeight: 0.22, brandWeight: 0.82 },
  { category: 'honey', toleranceLevel: 'strict', priceWeight: 0.20, brandWeight: 0.90 },
  { category: 'tea', toleranceLevel: 'strict', priceWeight: 0.25, brandWeight: 0.78 },
  { category: 'milk', toleranceLevel: 'strict', priceWeight: 0.20, brandWeight: 0.85 },
  { category: 'snacks', toleranceLevel: 'strict', priceWeight: 0.30, brandWeight: 0.75 },
];

export const personaHealthPriya: UserProfile = {
  userId: 'persona-health-priya',
  dietaryFlags: priyaDietaryFlags,
  brandLoyalty: priyaBrandLoyalty,
  qualityPreferences: priyaQualityPreferences,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ─── Exports ─────────────────────────────────────────────────────────────────

/** All demo personas ready to be seeded into the Preference Graph */
export const demoPersonas: UserProfile[] = [personaBudgetRahul, personaHealthPriya];
