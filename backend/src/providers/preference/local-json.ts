/**
 * Local JSON file-based Preference Store provider.
 * Fallback implementation for PreferenceStoreProvider when DynamoDB is unavailable.
 *
 * Uses the same PK/SK structure as the DynamoDB single-table design:
 *   PK: USER#<userId>   SK: PROFILE                       → dietaryFlags, createdAt
 *   PK: USER#<userId>   SK: BRAND#<category>#<brand>      → score, lastUpdated
 *   PK: USER#<userId>   SK: QUALITY#<category>            → toleranceLevel, priceWeight, brandWeight
 *
 * Requirement: 12.1
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PreferenceStoreProvider } from '../interfaces.js';
import type {
  UserProfile,
  CategoryPreferences,
  DietaryFlag,
  BrandLoyaltyEntry,
  QualityPreference,
} from '../../models/index.js';

// ─── Internal record types matching DynamoDB item shapes ─────────────────────

interface ProfileRecord {
  PK: string;
  SK: 'PROFILE';
  dietaryFlags: DietaryFlag[];
  createdAt: number;
  updatedAt: number;
}

interface BrandLoyaltyRecord {
  PK: string;
  SK: string; // BRAND#<category>#<brand>
  score: number;
  lastUpdated: number;
}

interface QualityPrefRecord {
  PK: string;
  SK: string; // QUALITY#<category>
  toleranceLevel: 'strict' | 'moderate' | 'flexible';
  priceWeight: number;
  brandWeight: number;
}

type ItemRecord = ProfileRecord | BrandLoyaltyRecord | QualityPrefRecord;

/**
 * JSON store shape: Record<PK, Record<SK, ItemRecord>>
 */
type StoreData = Record<string, Record<string, ItemRecord>>;

// ─── Implementation ──────────────────────────────────────────────────────────

export class LocalJsonPreferenceStore implements PreferenceStoreProvider {
  private readonly filePath: string;
  private data: StoreData;
  private writeInProgress = false;

  constructor(filePath = 'data/preferences.json') {
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  // ─── Public Interface ────────────────────────────────────────────────────

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const pk = `USER#${userId}`;
    const items = this.data[pk];

    if (!items) {
      return null;
    }

    const profileItem = items['PROFILE'] as ProfileRecord | undefined;
    if (!profileItem) {
      return null;
    }

    // Collect brand loyalty entries
    const brandLoyalty: BrandLoyaltyEntry[] = [];
    for (const [sk, item] of Object.entries(items)) {
      if (sk.startsWith('BRAND#')) {
        const record = item as BrandLoyaltyRecord;
        const parts = sk.split('#'); // BRAND#<category>#<brand>
        brandLoyalty.push({
          category: parts[1],
          brand: parts[2],
          score: record.score,
          lastUpdated: record.lastUpdated,
        });
      }
    }

    // Collect quality preferences
    const qualityPreferences: QualityPreference[] = [];
    for (const [sk, item] of Object.entries(items)) {
      if (sk.startsWith('QUALITY#')) {
        const record = item as QualityPrefRecord;
        const category = sk.split('#')[1];
        qualityPreferences.push({
          category,
          toleranceLevel: record.toleranceLevel,
          priceWeight: record.priceWeight,
          brandWeight: record.brandWeight,
        });
      }
    }

    return {
      userId,
      dietaryFlags: profileItem.dietaryFlags ?? [],
      brandLoyalty,
      qualityPreferences,
      createdAt: profileItem.createdAt,
      updatedAt: profileItem.updatedAt ?? profileItem.createdAt,
    };
  }

  async updateBrandLoyalty(
    userId: string,
    category: string,
    brand: string,
    delta: number
  ): Promise<void> {
    const pk = `USER#${userId}`;
    const sk = `BRAND#${category}#${brand}`;

    this.ensurePartition(pk);
    this.ensureProfile(pk, userId);

    const existing = this.data[pk][sk] as BrandLoyaltyRecord | undefined;
    const currentScore = existing?.score ?? 0;

    // Clamp score to 0-100 range
    const newScore = Math.max(0, Math.min(100, currentScore + delta));

    this.data[pk][sk] = {
      PK: pk,
      SK: sk,
      score: newScore,
      lastUpdated: Date.now(),
    } as BrandLoyaltyRecord;

    this.updateProfileTimestamp(pk);
    this.persistToDisk();
  }

  async setDietaryFlag(userId: string, flag: DietaryFlag): Promise<void> {
    const pk = `USER#${userId}`;

    this.ensurePartition(pk);
    this.ensureProfile(pk, userId);

    const profile = this.data[pk]['PROFILE'] as ProfileRecord;

    if (!profile.dietaryFlags.includes(flag)) {
      profile.dietaryFlags.push(flag);
    }

    this.updateProfileTimestamp(pk);
    this.persistToDisk();
  }

  async getPreferences(userId: string, category: string): Promise<CategoryPreferences> {
    const pk = `USER#${userId}`;
    const items = this.data[pk];

    // Default preferences when no data exists
    const defaults: CategoryPreferences = {
      category,
      toleranceLevel: 'moderate',
      priceWeight: 0.5,
      brandWeight: 0.5,
      preferredBrands: [],
    };

    if (!items) {
      return defaults;
    }

    // Look up quality preference for the category
    const qualitySk = `QUALITY#${category}`;
    const qualityRecord = items[qualitySk] as QualityPrefRecord | undefined;

    // Collect preferred brands for this category (score > 50)
    const preferredBrands: string[] = [];
    for (const [sk, item] of Object.entries(items)) {
      if (sk.startsWith(`BRAND#${category}#`)) {
        const record = item as BrandLoyaltyRecord;
        if (record.score > 50) {
          const brand = sk.split('#')[2];
          preferredBrands.push(brand);
        }
      }
    }

    return {
      category,
      toleranceLevel: qualityRecord?.toleranceLevel ?? defaults.toleranceLevel,
      priceWeight: qualityRecord?.priceWeight ?? defaults.priceWeight,
      brandWeight: qualityRecord?.brandWeight ?? defaults.brandWeight,
      preferredBrands,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private ensurePartition(pk: string): void {
    if (!this.data[pk]) {
      this.data[pk] = {};
    }
  }

  private ensureProfile(pk: string, _userId?: string): void {
    if (!this.data[pk]['PROFILE']) {
      const now = Date.now();
      this.data[pk]['PROFILE'] = {
        PK: pk,
        SK: 'PROFILE',
        dietaryFlags: [],
        createdAt: now,
        updatedAt: now,
      } as ProfileRecord;
    }
  }

  private updateProfileTimestamp(pk: string): void {
    const profile = this.data[pk]['PROFILE'] as ProfileRecord | undefined;
    if (profile) {
      profile.updatedAt = Date.now();
    }
  }

  private loadFromDisk(): StoreData {
    try {
      if (!existsSync(this.filePath)) {
        return {};
      }
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return {};
      }
      return parsed as StoreData;
    } catch {
      // If file is corrupted or unreadable, start fresh
      return {};
    }
  }

  private persistToDisk(): void {
    // Simple single-process write guard
    if (this.writeInProgress) {
      // Queue a re-write after current finishes — in single-process Node
      // synchronous writes are atomic so this is just a safety belt.
      queueMicrotask(() => this.persistToDisk());
      return;
    }

    this.writeInProgress = true;
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } finally {
      this.writeInProgress = false;
    }
  }
}
