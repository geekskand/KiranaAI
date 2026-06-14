/**
 * Unit tests for DynamoDB Preference Store.
 *
 * Uses vitest mocking to simulate DynamoDB Document Client responses,
 * verifying the PK/SK patterns and data assembly logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamoDBPreferenceStore } from './dynamodb.js';

// Mock the AWS SDK modules
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  const sendMock = vi.fn();
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send: sendMock })),
    },
    QueryCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Query' })),
    PutCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Put' })),
    UpdateCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Update' })),
    GetCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Get' })),
  };
});

function getSendMock(store: DynamoDBPreferenceStore) {
  // Access the mocked client's send function
  return (store as any).client.send as ReturnType<typeof vi.fn>;
}

describe('DynamoDBPreferenceStore', () => {
  let store: DynamoDBPreferenceStore;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new DynamoDBPreferenceStore({
      tableName: 'KiranaAI',
      region: 'ap-south-1',
    });
    sendMock = getSendMock(store);
  });

  describe('getUserProfile', () => {
    it('returns null when no items found', async () => {
      sendMock.mockResolvedValueOnce({ Items: [] });

      const result = await store.getUserProfile('user-123');
      expect(result).toBeNull();
    });

    it('returns null when Items is undefined', async () => {
      sendMock.mockResolvedValueOnce({ Items: undefined });

      const result = await store.getUserProfile('user-456');
      expect(result).toBeNull();
    });

    it('assembles a full user profile from multiple DynamoDB items', async () => {
      const now = Date.now();
      sendMock.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-123',
            SK: 'PROFILE',
            dietaryFlags: ['vegetarian', 'gluten-free'],
            createdAt: now - 10000,
            updatedAt: now,
          },
          {
            PK: 'USER#user-123',
            SK: 'BRAND#dairy#Amul',
            score: 85,
            lastUpdated: now,
          },
          {
            PK: 'USER#user-123',
            SK: 'BRAND#snacks#Haldirams',
            score: 70,
            lastUpdated: now - 5000,
          },
          {
            PK: 'USER#user-123',
            SK: 'QUALITY#dairy',
            toleranceLevel: 'strict',
            priceWeight: 0.3,
            brandWeight: 0.8,
          },
        ],
      });

      const profile = await store.getUserProfile('user-123');

      expect(profile).not.toBeNull();
      expect(profile!.userId).toBe('user-123');
      expect(profile!.dietaryFlags).toEqual(['vegetarian', 'gluten-free']);
      expect(profile!.brandLoyalty).toHaveLength(2);
      expect(profile!.brandLoyalty[0]).toEqual({
        category: 'dairy',
        brand: 'Amul',
        score: 85,
        lastUpdated: now,
      });
      expect(profile!.brandLoyalty[1]).toEqual({
        category: 'snacks',
        brand: 'Haldirams',
        score: 70,
        lastUpdated: now - 5000,
      });
      expect(profile!.qualityPreferences).toHaveLength(1);
      expect(profile!.qualityPreferences[0]).toEqual({
        category: 'dairy',
        toleranceLevel: 'strict',
        priceWeight: 0.3,
        brandWeight: 0.8,
      });
      expect(profile!.createdAt).toBe(now - 10000);
      expect(profile!.updatedAt).toBe(now);
    });

    it('uses correct PK pattern in the query', async () => {
      sendMock.mockResolvedValueOnce({ Items: [] });
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');

      await store.getUserProfile('test-user');

      expect(QueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'KiranaAI',
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': 'USER#test-user' },
        })
      );
    });
  });

  describe('updateBrandLoyalty', () => {
    it('sends update command with correct PK/SK and delta', async () => {
      sendMock.mockResolvedValue({});
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');

      await store.updateBrandLoyalty('user-123', 'dairy', 'Amul', 5);

      // First call: update brand loyalty
      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'KiranaAI',
          Key: { PK: 'USER#user-123', SK: 'BRAND#dairy#Amul' },
        })
      );

      // Second call: update profile timestamp
      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'KiranaAI',
          Key: { PK: 'USER#user-123', SK: 'PROFILE' },
        })
      );
    });
  });

  describe('setDietaryFlag', () => {
    it('adds a new flag to the profile', async () => {
      // GetCommand returns existing profile without the flag
      sendMock.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'PROFILE',
          dietaryFlags: ['vegetarian'],
          createdAt: 1000,
          updatedAt: 2000,
        },
      });
      // PutCommand succeeds
      sendMock.mockResolvedValueOnce({});

      const { PutCommand } = await import('@aws-sdk/lib-dynamodb');

      await store.setDietaryFlag('user-123', 'gluten-free');

      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'KiranaAI',
          Item: expect.objectContaining({
            PK: 'USER#user-123',
            SK: 'PROFILE',
            dietaryFlags: ['vegetarian', 'gluten-free'],
            createdAt: 1000,
          }),
        })
      );
    });

    it('does not duplicate an existing flag', async () => {
      sendMock.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'PROFILE',
          dietaryFlags: ['vegetarian', 'gluten-free'],
          createdAt: 1000,
          updatedAt: 2000,
        },
      });
      // UpdateCommand for timestamp
      sendMock.mockResolvedValueOnce({});

      const { PutCommand } = await import('@aws-sdk/lib-dynamodb');

      await store.setDietaryFlag('user-123', 'gluten-free');

      // PutCommand should NOT be called (only UpdateCommand for timestamp)
      expect(PutCommand).not.toHaveBeenCalled();
    });

    it('creates profile if it does not exist', async () => {
      // GetCommand returns no item
      sendMock.mockResolvedValueOnce({ Item: undefined });
      // PutCommand succeeds
      sendMock.mockResolvedValueOnce({});

      const { PutCommand } = await import('@aws-sdk/lib-dynamodb');

      await store.setDietaryFlag('new-user', 'vegan');

      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'USER#new-user',
            SK: 'PROFILE',
            dietaryFlags: ['vegan'],
          }),
        })
      );
    });
  });

  describe('getPreferences', () => {
    it('returns quality preferences and preferred brands for a category', async () => {
      // First query: quality preferences
      sendMock.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-123',
            SK: 'QUALITY#dairy',
            toleranceLevel: 'strict',
            priceWeight: 0.3,
            brandWeight: 0.8,
          },
        ],
      });
      // Second query: brand loyalty
      sendMock.mockResolvedValueOnce({
        Items: [
          { PK: 'USER#user-123', SK: 'BRAND#dairy#Amul', score: 85 },
          { PK: 'USER#user-123', SK: 'BRAND#dairy#Mother Dairy', score: 60 },
        ],
      });

      const prefs = await store.getPreferences('user-123', 'dairy');

      expect(prefs.category).toBe('dairy');
      expect(prefs.toleranceLevel).toBe('strict');
      expect(prefs.priceWeight).toBe(0.3);
      expect(prefs.brandWeight).toBe(0.8);
      expect(prefs.preferredBrands).toEqual(['Amul', 'Mother Dairy']);
    });

    it('returns defaults when no quality preference exists', async () => {
      sendMock.mockResolvedValueOnce({ Items: [] });
      sendMock.mockResolvedValueOnce({ Items: [] });

      const prefs = await store.getPreferences('user-123', 'beverages');

      expect(prefs.category).toBe('beverages');
      expect(prefs.toleranceLevel).toBe('moderate');
      expect(prefs.priceWeight).toBe(0.5);
      expect(prefs.brandWeight).toBe(0.5);
      expect(prefs.preferredBrands).toEqual([]);
    });

    it('sorts preferred brands by score descending', async () => {
      sendMock.mockResolvedValueOnce({ Items: [] });
      sendMock.mockResolvedValueOnce({
        Items: [
          { PK: 'USER#user-123', SK: 'BRAND#snacks#Local', score: 30 },
          { PK: 'USER#user-123', SK: 'BRAND#snacks#Haldirams', score: 90 },
          { PK: 'USER#user-123', SK: 'BRAND#snacks#Lays', score: 50 },
        ],
      });

      const prefs = await store.getPreferences('user-123', 'snacks');

      expect(prefs.preferredBrands).toEqual(['Haldirams', 'Lays', 'Local']);
    });
  });
});
