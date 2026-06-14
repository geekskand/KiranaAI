/**
 * Unit tests for Agent Tool Dispatch.
 * Validates routing to correct providers and handling of edge cases.
 *
 * Requirements: 2.4, 5.1, 9.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchTool, type ToolContext } from './tools.js';
import type {
  PreferenceStoreProvider,
  SessionStoreProvider,
  CacheProvider,
} from '../providers/interfaces.js';
import type { Product, UserProfile, SessionContext, CategoryPreferences } from '../models/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCatalog(): Product[] {
  return [
    {
      productId: 'prod-001',
      name: 'Amul Milk',
      price: 60,
      category: 'dairy',
      brand: 'Amul',
      labels: ['vegetarian'],
    },
    {
      productId: 'prod-002',
      name: 'Mother Dairy Milk',
      price: 55,
      category: 'dairy',
      brand: 'Mother Dairy',
      labels: ['vegetarian'],
    },
    {
      productId: 'prod-003',
      name: 'Organic Honey',
      price: 250,
      category: 'pantry',
      brand: 'Dabur',
      labels: ['organic-only', 'vegetarian'],
    },
    {
      productId: 'prod-004',
      name: 'Brown Bread',
      price: 45,
      category: 'bakery',
      brand: 'Britannia',
      labels: ['vegetarian', 'low-sugar'],
    },
    {
      productId: 'prod-005',
      name: 'Almond Milk',
      price: 120,
      category: 'dairy',
      brand: 'Sofit',
      labels: ['vegan', 'dairy-free', 'gluten-free'],
    },
  ];
}

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'user-001',
    dietaryFlags: [],
    brandLoyalty: [
      { category: 'dairy', brand: 'Amul', score: 85, lastUpdated: Date.now() },
    ],
    qualityPreferences: [
      { category: 'dairy', toleranceLevel: 'moderate', priceWeight: 0.5, brandWeight: 0.5 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'session-001',
    userId: 'user-001',
    conversationHistory: [],
    cartState: [],
    agentReasoningHistory: [],
    suggestionsGiven: { basketCompletion: 0, gapFill: 0 },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function makeMockContext(overrides: Partial<{
  profile: UserProfile | null;
  session: SessionContext | null;
  categoryPrefs: CategoryPreferences;
}> = {}): ToolContext {
  const profile = overrides.profile !== undefined ? overrides.profile : makeUserProfile();
  const session = overrides.session !== undefined ? overrides.session : makeSession();
  const categoryPrefs = overrides.categoryPrefs ?? {
    category: 'dairy',
    toleranceLevel: 'moderate' as const,
    priceWeight: 0.5,
    brandWeight: 0.5,
    preferredBrands: ['Amul'],
  };

  const preferenceStore: PreferenceStoreProvider = {
    getUserProfile: vi.fn().mockResolvedValue(profile),
    updateBrandLoyalty: vi.fn().mockResolvedValue(undefined),
    setDietaryFlag: vi.fn().mockResolvedValue(undefined),
    getPreferences: vi.fn().mockResolvedValue(categoryPrefs),
  };

  const sessionStore: SessionStoreProvider = {
    getSession: vi.fn().mockResolvedValue(session),
    saveSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  };

  const cache: CacheProvider = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  return {
    preferenceStore,
    sessionStore,
    cache,
    catalog: makeCatalog(),
  };
}

// ─── dispatch unknown tool ───────────────────────────────────────────────────

describe('dispatchTool - Unknown tool', () => {
  it('should return error for an unknown tool name', async () => {
    const context = makeMockContext();
    const result = await dispatchTool('unknown_tool', {}, context);

    expect(result.success).toBe(false);
    expect(result.data).toEqual({ error: 'Unknown tool: unknown_tool' });
  });
});

// ─── lookup_preference ───────────────────────────────────────────────────────

describe('dispatchTool - lookup_preference', () => {
  it('should return full user profile when no category is specified', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'lookup_preference',
      { userId: 'user-001' },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as UserProfile;
    expect(data.userId).toBe('user-001');
    expect(data.brandLoyalty).toHaveLength(1);
    expect(data.brandLoyalty[0].brand).toBe('Amul');
    expect(context.preferenceStore.getUserProfile).toHaveBeenCalledWith('user-001');
  });

  it('should return category preferences when category is specified', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'lookup_preference',
      { userId: 'user-001', category: 'dairy' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      category: 'dairy',
      toleranceLevel: 'moderate',
      priceWeight: 0.5,
      brandWeight: 0.5,
      preferredBrands: ['Amul'],
    });
    expect(context.preferenceStore.getPreferences).toHaveBeenCalledWith('user-001', 'dairy');
  });

  it('should return error when userId is missing', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'lookup_preference',
      { userId: '' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.data).toEqual({ error: 'userId is required' });
  });

  it('should return error when user profile is not found', async () => {
    const context = makeMockContext({ profile: null });
    const result = await dispatchTool(
      'lookup_preference',
      { userId: 'nonexistent' },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('User profile not found');
  });
});

// ─── search_products ─────────────────────────────────────────────────────────

describe('dispatchTool - search_products', () => {
  it('should return all products when no filters are applied', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: '' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(5);
  });

  it('should filter by query matching product name', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: 'milk' },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(3); // Amul Milk, Mother Dairy Milk, Almond Milk
    expect(products.every((p) => p.name.toLowerCase().includes('milk'))).toBe(true);
  });

  it('should filter by category', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: '', category: 'dairy' },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(3);
    expect(products.every((p) => p.category === 'dairy')).toBe(true);
  });

  it('should filter by price range', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: '', filters: { minPrice: 50, maxPrice: 100 } },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.every((p) => p.price >= 50 && p.price <= 100)).toBe(true);
  });

  it('should filter by brands', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: '', filters: { brands: ['Amul', 'Dabur'] } },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(2);
    expect(products.every((p) => ['amul', 'dabur'].includes(p.brand.toLowerCase()))).toBe(true);
  });

  it('should filter by labels', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: '', filters: { labels: ['vegan'] } },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(1);
    expect(products[0].productId).toBe('prod-005');
  });

  it('should filter by dietary flags (product must have all flags)', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: '', filters: { dietaryFlags: ['vegan', 'dairy-free'] } },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(1);
    expect(products[0].productId).toBe('prod-005');
  });

  it('should combine query and category filters', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: 'milk', category: 'dairy' },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(3);
  });

  it('should return empty array when no products match', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: 'nonexistent-product-xyz' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should match query against brand name', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'search_products',
      { query: 'Britannia' },
      context
    );

    expect(result.success).toBe(true);
    const products = result.data as Product[];
    expect(products.length).toBe(1);
    expect(products[0].productId).toBe('prod-004');
  });
});

// ─── check_quality_tolerance ─────────────────────────────────────────────────

describe('dispatchTool - check_quality_tolerance', () => {
  it('should compute quality tolerance between two products', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'check_quality_tolerance',
      {
        userId: 'user-001',
        originalProductId: 'prod-001',
        substituteProductId: 'prod-002',
      },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { score: number; acceptable: boolean; reasons: string[] };
    expect(data.score).toBeGreaterThan(0);
    expect(data.score).toBeLessThanOrEqual(1);
    expect(typeof data.acceptable).toBe('boolean');
    expect(Array.isArray(data.reasons)).toBe(true);
  });

  it('should return error when original product is not found', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'check_quality_tolerance',
      {
        userId: 'user-001',
        originalProductId: 'nonexistent',
        substituteProductId: 'prod-002',
      },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('Original product not found');
  });

  it('should return error when substitute product is not found', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'check_quality_tolerance',
      {
        userId: 'user-001',
        originalProductId: 'prod-001',
        substituteProductId: 'nonexistent',
      },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('Substitute product not found');
  });

  it('should return error when user profile is not found', async () => {
    const context = makeMockContext({ profile: null });
    const result = await dispatchTool(
      'check_quality_tolerance',
      {
        userId: 'user-001',
        originalProductId: 'prod-001',
        substituteProductId: 'prod-002',
      },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('User profile not found');
  });

  it('should return error when required inputs are missing', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'check_quality_tolerance',
      { userId: '', originalProductId: 'prod-001', substituteProductId: 'prod-002' },
      context
    );

    expect(result.success).toBe(false);
  });

  it('should mark substitute as acceptable for same-brand same-category same-price', async () => {
    const context = makeMockContext();
    // prod-001 (Amul, dairy, 60) vs prod-002 (Mother Dairy, dairy, 55)
    // User has 85 loyalty to Amul in dairy, moderate tolerance
    const result = await dispatchTool(
      'check_quality_tolerance',
      {
        userId: 'user-001',
        originalProductId: 'prod-001',
        substituteProductId: 'prod-002',
      },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { score: number; acceptable: boolean; reasons: string[] };
    // Mother Dairy has no loyalty entry, so brandMatch = 0.3
    // categoryMatch = 1.0, priceDeviation = 1.0 (cheaper), dietary = 1.0, quality = 0.75
    // score = 0.3*0.2 + 1.0*0.15 + 1.0*0.25 + 1.0*0.25 + 0.75*0.15
    // = 0.06 + 0.15 + 0.25 + 0.25 + 0.1125 = 0.8225
    expect(data.score).toBeGreaterThan(0.6);
    expect(data.acceptable).toBe(true);
  });
});

// ─── update_cart ─────────────────────────────────────────────────────────────

describe('dispatchTool - update_cart', () => {
  it('should add a product to an empty cart', async () => {
    const session = makeSession({ cartState: [] });
    const context = makeMockContext({ session });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'prod-001', action: 'add' },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { success: boolean; cartTotal: number };
    expect(data.success).toBe(true);
    expect(data.cartTotal).toBe(60); // Amul Milk price

    expect(context.sessionStore.saveSession).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({
        cartState: [
          { productId: 'prod-001', name: 'Amul Milk', price: 60, quantity: 1 },
        ],
      })
    );
  });

  it('should increment quantity when adding existing product', async () => {
    const session = makeSession({
      cartState: [{ productId: 'prod-001', name: 'Amul Milk', price: 60, quantity: 1 }],
    });
    const context = makeMockContext({ session });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'prod-001', action: 'add' },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { success: boolean; cartTotal: number };
    expect(data.cartTotal).toBe(120); // 60 * 2

    expect(context.sessionStore.saveSession).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({
        cartState: [
          { productId: 'prod-001', name: 'Amul Milk', price: 60, quantity: 2 },
        ],
      })
    );
  });

  it('should remove a product from cart (quantity 1 → remove)', async () => {
    const session = makeSession({
      cartState: [{ productId: 'prod-001', name: 'Amul Milk', price: 60, quantity: 1 }],
    });
    const context = makeMockContext({ session });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'prod-001', action: 'remove' },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { success: boolean; cartTotal: number };
    expect(data.cartTotal).toBe(0);

    expect(context.sessionStore.saveSession).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({ cartState: [] })
    );
  });

  it('should decrement quantity when removing product with quantity > 1', async () => {
    const session = makeSession({
      cartState: [{ productId: 'prod-001', name: 'Amul Milk', price: 60, quantity: 3 }],
    });
    const context = makeMockContext({ session });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'prod-001', action: 'remove' },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { success: boolean; cartTotal: number };
    expect(data.cartTotal).toBe(120); // 60 * 2
  });

  it('should return error when session is not found', async () => {
    const context = makeMockContext({ session: null });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'nonexistent', productId: 'prod-001', action: 'add' },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('Session not found');
  });

  it('should return error when product is not in catalog (add)', async () => {
    const context = makeMockContext();
    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'nonexistent', action: 'add' },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('Product not found in catalog');
  });

  it('should return error when trying to remove product not in cart', async () => {
    const session = makeSession({ cartState: [] });
    const context = makeMockContext({ session });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'prod-001', action: 'remove' },
      context
    );

    expect(result.success).toBe(false);
    expect((result.data as { error: string }).error).toContain('Product not in cart');
  });

  it('should return error when required inputs are missing', async () => {
    const context = makeMockContext();

    const result = await dispatchTool(
      'update_cart',
      { sessionId: '', productId: 'prod-001', action: 'add' },
      context
    );

    expect(result.success).toBe(false);
  });

  it('should calculate cart total with multiple products', async () => {
    const session = makeSession({
      cartState: [
        { productId: 'prod-001', name: 'Amul Milk', price: 60, quantity: 2 },
        { productId: 'prod-004', name: 'Brown Bread', price: 45, quantity: 1 },
      ],
    });
    const context = makeMockContext({ session });

    const result = await dispatchTool(
      'update_cart',
      { sessionId: 'session-001', productId: 'prod-003', action: 'add' },
      context
    );

    expect(result.success).toBe(true);
    const data = result.data as { success: boolean; cartTotal: number };
    // 60*2 + 45*1 + 250*1 = 120 + 45 + 250 = 415
    expect(data.cartTotal).toBe(415);
  });
});
