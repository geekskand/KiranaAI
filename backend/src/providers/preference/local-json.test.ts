/**
 * Unit tests for LocalJsonPreferenceStore.
 * Tests the fallback preference store implementation using a temporary JSON file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalJsonPreferenceStore } from './local-json.js';

const TEST_DIR = join(process.cwd(), 'tmp-test-data');
const TEST_FILE = join(TEST_DIR, 'test-preferences.json');

describe('LocalJsonPreferenceStore', () => {
  let store: LocalJsonPreferenceStore;

  beforeEach(() => {
    // Clean up any previous test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
    store = new LocalJsonPreferenceStore(TEST_FILE);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('getUserProfile', () => {
    it('returns null for a non-existent user', async () => {
      const result = await store.getUserProfile('unknown-user');
      expect(result).toBeNull();
    });

    it('returns a profile after data is written', async () => {
      await store.setDietaryFlag('user1', 'vegetarian');
      const profile = await store.getUserProfile('user1');

      expect(profile).not.toBeNull();
      expect(profile!.userId).toBe('user1');
      expect(profile!.dietaryFlags).toContain('vegetarian');
      expect(profile!.createdAt).toBeGreaterThan(0);
    });

    it('aggregates brand loyalty and quality preferences', async () => {
      await store.updateBrandLoyalty('user1', 'dairy', 'Amul', 75);
      await store.updateBrandLoyalty('user1', 'dairy', 'Mother Dairy', 30);
      await store.setDietaryFlag('user1', 'gluten-free');

      const profile = await store.getUserProfile('user1');

      expect(profile!.dietaryFlags).toContain('gluten-free');
      expect(profile!.brandLoyalty).toHaveLength(2);
      expect(profile!.brandLoyalty.find((b) => b.brand === 'Amul')?.score).toBe(75);
      expect(profile!.brandLoyalty.find((b) => b.brand === 'Mother Dairy')?.score).toBe(30);
    });
  });

  describe('updateBrandLoyalty', () => {
    it('creates a new loyalty entry with the delta as the initial score', async () => {
      await store.updateBrandLoyalty('user1', 'snacks', 'Haldirams', 60);
      const profile = await store.getUserProfile('user1');

      const entry = profile!.brandLoyalty.find((b) => b.brand === 'Haldirams');
      expect(entry).toBeDefined();
      expect(entry!.score).toBe(60);
      expect(entry!.category).toBe('snacks');
    });

    it('increments an existing score by delta', async () => {
      await store.updateBrandLoyalty('user1', 'snacks', 'Haldirams', 40);
      await store.updateBrandLoyalty('user1', 'snacks', 'Haldirams', 20);

      const profile = await store.getUserProfile('user1');
      const entry = profile!.brandLoyalty.find((b) => b.brand === 'Haldirams');
      expect(entry!.score).toBe(60);
    });

    it('clamps score to 0-100 range', async () => {
      await store.updateBrandLoyalty('user1', 'dairy', 'Amul', 90);
      await store.updateBrandLoyalty('user1', 'dairy', 'Amul', 20); // would be 110

      const profile = await store.getUserProfile('user1');
      expect(profile!.brandLoyalty.find((b) => b.brand === 'Amul')?.score).toBe(100);

      await store.updateBrandLoyalty('user1', 'dairy', 'Amul', -150); // would be -50
      const profile2 = await store.getUserProfile('user1');
      expect(profile2!.brandLoyalty.find((b) => b.brand === 'Amul')?.score).toBe(0);
    });
  });

  describe('setDietaryFlag', () => {
    it('adds a new dietary flag', async () => {
      await store.setDietaryFlag('user1', 'vegan');
      const profile = await store.getUserProfile('user1');

      expect(profile!.dietaryFlags).toContain('vegan');
    });

    it('does not duplicate an existing flag', async () => {
      await store.setDietaryFlag('user1', 'vegan');
      await store.setDietaryFlag('user1', 'vegan');

      const profile = await store.getUserProfile('user1');
      const veganCount = profile!.dietaryFlags.filter((f) => f === 'vegan').length;
      expect(veganCount).toBe(1);
    });

    it('supports multiple flags on the same user', async () => {
      await store.setDietaryFlag('user1', 'vegan');
      await store.setDietaryFlag('user1', 'gluten-free');
      await store.setDietaryFlag('user1', 'low-sugar');

      const profile = await store.getUserProfile('user1');
      expect(profile!.dietaryFlags).toHaveLength(3);
      expect(profile!.dietaryFlags).toEqual(
        expect.arrayContaining(['vegan', 'gluten-free', 'low-sugar'])
      );
    });
  });

  describe('getPreferences', () => {
    it('returns defaults when no data exists for the user', async () => {
      const prefs = await store.getPreferences('unknown', 'dairy');

      expect(prefs.category).toBe('dairy');
      expect(prefs.toleranceLevel).toBe('moderate');
      expect(prefs.priceWeight).toBe(0.5);
      expect(prefs.brandWeight).toBe(0.5);
      expect(prefs.preferredBrands).toEqual([]);
    });

    it('returns preferred brands with score > 50', async () => {
      await store.updateBrandLoyalty('user1', 'dairy', 'Amul', 80);
      await store.updateBrandLoyalty('user1', 'dairy', 'Mother Dairy', 30);
      await store.updateBrandLoyalty('user1', 'dairy', 'Verka', 60);

      const prefs = await store.getPreferences('user1', 'dairy');

      expect(prefs.preferredBrands).toContain('Amul');
      expect(prefs.preferredBrands).toContain('Verka');
      expect(prefs.preferredBrands).not.toContain('Mother Dairy');
    });
  });

  describe('persistence', () => {
    it('persists data to disk and reloads on new instance', async () => {
      await store.setDietaryFlag('user1', 'vegetarian');
      await store.updateBrandLoyalty('user1', 'dairy', 'Amul', 70);

      // Create a new store instance pointing at the same file
      const store2 = new LocalJsonPreferenceStore(TEST_FILE);
      const profile = await store2.getUserProfile('user1');

      expect(profile).not.toBeNull();
      expect(profile!.dietaryFlags).toContain('vegetarian');
      expect(profile!.brandLoyalty).toHaveLength(1);
      expect(profile!.brandLoyalty[0].brand).toBe('Amul');
      expect(profile!.brandLoyalty[0].score).toBe(70);
    });

    it('creates the file and directory if they do not exist', async () => {
      const nestedPath = join(TEST_DIR, 'nested', 'deep', 'prefs.json');
      const nestedStore = new LocalJsonPreferenceStore(nestedPath);

      await nestedStore.setDietaryFlag('user1', 'organic-only');
      expect(existsSync(nestedPath)).toBe(true);
    });
  });
});
