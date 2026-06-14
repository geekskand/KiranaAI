/**
 * DynamoDB Preference Store — Primary Provider
 *
 * Implements the PreferenceStoreProvider interface using a DynamoDB single-table design.
 *
 * Table: KiranaAI
 * PK/SK Patterns:
 *   - User Profile:  PK=USER#<userId>, SK=PROFILE
 *   - Brand Loyalty: PK=USER#<userId>, SK=BRAND#<category>#<brand>
 *   - Quality Pref:  PK=USER#<userId>, SK=QUALITY#<category>
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

import type { PreferenceStoreProvider } from '../interfaces.js';
import type {
  UserProfile,
  CategoryPreferences,
  DietaryFlag,
  BrandLoyaltyEntry,
  QualityPreference,
} from '../../models/index.js';

export interface DynamoDBPreferenceStoreConfig {
  tableName: string;
  region?: string;
  endpoint?: string;
}

export class DynamoDBPreferenceStore implements PreferenceStoreProvider {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(config: DynamoDBPreferenceStoreConfig) {
    this.tableName = config.tableName;

    const dynamoClient = new DynamoDBClient({
      region: config.region ?? 'ap-south-1',
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });

    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Retrieve the full user profile in a single query.
   * Queries all items with PK = USER#<userId> and assembles them into a UserProfile.
   *
   * Requirement 2.4: Support retrieval of a complete user profile in a single query operation.
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const pk = `USER#${userId}`;

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    let dietaryFlags: DietaryFlag[] = [];
    let createdAt = Date.now();
    let updatedAt = Date.now();
    const brandLoyalty: BrandLoyaltyEntry[] = [];
    const qualityPreferences: QualityPreference[] = [];

    for (const item of result.Items) {
      const sk = item.SK as string;

      if (sk === 'PROFILE') {
        dietaryFlags = (item.dietaryFlags as DietaryFlag[]) ?? [];
        createdAt = (item.createdAt as number) ?? Date.now();
        updatedAt = (item.updatedAt as number) ?? Date.now();
      } else if (sk.startsWith('BRAND#')) {
        // SK format: BRAND#<category>#<brand>
        const parts = sk.split('#');
        const category = parts[1];
        const brand = parts.slice(2).join('#'); // brand name might contain #
        brandLoyalty.push({
          category,
          brand,
          score: item.score as number,
          lastUpdated: item.lastUpdated as number,
        });
      } else if (sk.startsWith('QUALITY#')) {
        // SK format: QUALITY#<category>
        const category = sk.substring('QUALITY#'.length);
        qualityPreferences.push({
          category,
          toleranceLevel: item.toleranceLevel as 'strict' | 'moderate' | 'flexible',
          priceWeight: item.priceWeight as number,
          brandWeight: item.brandWeight as number,
        });
      }
    }

    return {
      userId,
      dietaryFlags,
      brandLoyalty,
      qualityPreferences,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Update brand loyalty score for a category/brand combination.
   * Uses an atomic update expression to increment the score by delta.
   *
   * Requirement 2.2: Update the relevant brand loyalty score on purchase/confirmation.
   */
  async updateBrandLoyalty(
    userId: string,
    category: string,
    brand: string,
    delta: number
  ): Promise<void> {
    const pk = `USER#${userId}`;
    const sk = `BRAND#${category}#${brand}`;
    const now = Date.now();

    // Use UpdateItem with ADD to handle both create and update atomically.
    // If the item doesn't exist, DynamoDB creates it with score = delta.
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression:
          'SET score = if_not_exists(score, :zero) + :delta, lastUpdated = :now',
        ExpressionAttributeValues: {
          ':delta': delta,
          ':zero': 0,
          ':now': now,
        },
      })
    );

    // Also update the profile's updatedAt timestamp
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: 'PROFILE' },
        UpdateExpression: 'SET updatedAt = :now, createdAt = if_not_exists(createdAt, :now), dietaryFlags = if_not_exists(dietaryFlags, :emptyList)',
        ExpressionAttributeValues: {
          ':now': now,
          ':emptyList': [],
        },
      })
    );
  }

  /**
   * Set a dietary flag on the user's profile.
   * Adds the flag to the dietaryFlags list if not already present.
   *
   * Requirement 2.3: Persist dietary restriction flags.
   */
  async setDietaryFlag(userId: string, flag: DietaryFlag): Promise<void> {
    const pk = `USER#${userId}`;
    const sk = 'PROFILE';
    const now = Date.now();

    // First, get the current profile to check if the flag already exists
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
      })
    );

    const currentFlags: DietaryFlag[] = (result.Item?.dietaryFlags as DietaryFlag[]) ?? [];

    if (currentFlags.includes(flag)) {
      // Flag already set, just update the timestamp
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET updatedAt = :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        })
      );
      return;
    }

    // Add the flag to the list
    const updatedFlags = [...currentFlags, flag];

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: pk,
          SK: sk,
          dietaryFlags: updatedFlags,
          createdAt: (result.Item?.createdAt as number) ?? now,
          updatedAt: now,
        },
      })
    );
  }

  /**
   * Get preferences for a specific category.
   * Returns quality tolerance and preferred brands for the given category.
   *
   * Access pattern: PK = USER#<userId>, SK begins_with QUALITY#<category>
   * Also queries brand loyalty entries for the same category.
   */
  async getPreferences(userId: string, category: string): Promise<CategoryPreferences> {
    const pk = `USER#${userId}`;

    // Query quality preferences for the category
    const qualityResult = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':sk': `QUALITY#${category}`,
        },
      })
    );

    // Query brand loyalty entries for the category
    const brandResult = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skPrefix': `BRAND#${category}#`,
        },
      })
    );

    // Extract preferred brands (sorted by score descending)
    const preferredBrands = (brandResult.Items ?? [])
      .map((item) => ({
        brand: (item.SK as string).split('#').slice(2).join('#'),
        score: item.score as number,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.brand);

    // Extract quality preferences or return defaults
    const qualityItem = qualityResult.Items?.[0];

    return {
      category,
      toleranceLevel: (qualityItem?.toleranceLevel as 'strict' | 'moderate' | 'flexible') ?? 'moderate',
      priceWeight: (qualityItem?.priceWeight as number) ?? 0.5,
      brandWeight: (qualityItem?.brandWeight as number) ?? 0.5,
      preferredBrands,
    };
  }
}
