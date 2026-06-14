/**
 * Agent Tool Dispatch — routes tool calls to domain engines and stores.
 *
 * Implements handlers for:
 * - lookup_preference → PreferenceStoreProvider
 * - search_products → SKU catalog filtering
 * - check_quality_tolerance → Quality Tolerance Engine
 * - update_cart → SessionStoreProvider
 *
 * Requirements: 2.4, 5.1, 9.3
 */

import type {
  PreferenceStoreProvider,
  SessionStoreProvider,
  CacheProvider,
} from '../providers/interfaces.js';
import type { Product, CartItem } from '../models/types.js';
import type {
  LookupPreferenceTool,
  SearchProductsTool,
  CheckQualityToleranceTool,
  UpdateCartTool,
  ProductFilters,
} from '../models/tools.js';
import { computeQualityTolerance } from '../engines/quality-tolerance.js';

// ─── Context & Result Interfaces ─────────────────────────────────────────────

export interface ToolContext {
  preferenceStore: PreferenceStoreProvider;
  sessionStore: SessionStoreProvider;
  cache: CacheProvider;
  catalog: Product[];
}

export interface ToolResult {
  success: boolean;
  data: unknown;
}

// ─── Tool Handlers ───────────────────────────────────────────────────────────

/**
 * Lookup user preferences from the Preference Graph.
 * If a category is specified, returns category-specific preferences.
 * Otherwise returns the full user profile.
 */
async function handleLookupPreference(
  input: LookupPreferenceTool['input'],
  context: ToolContext
): Promise<ToolResult> {
  const { userId, category } = input;

  if (!userId) {
    return { success: false, data: { error: 'userId is required' } };
  }

  if (category) {
    const preferences = await context.preferenceStore.getPreferences(userId, category);
    return { success: true, data: preferences };
  }

  const profile = await context.preferenceStore.getUserProfile(userId);
  if (!profile) {
    return { success: false, data: { error: `User profile not found for userId: ${userId}` } };
  }

  return { success: true, data: profile };
}

/**
 * Search products in the SKU catalog by query, category, and filters.
 * Filters include price range, brands, labels, and dietary flags.
 */
async function handleSearchProducts(
  input: SearchProductsTool['input'],
  context: ToolContext
): Promise<ToolResult> {
  const { query, category, filters } = input;

  let results = [...context.catalog];

  // Filter by query (match name case-insensitively)
  if (query) {
    const lowerQuery = query.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.category.toLowerCase().includes(lowerQuery) ||
        p.brand.toLowerCase().includes(lowerQuery)
    );
  }

  // Filter by category
  if (category) {
    const lowerCategory = category.toLowerCase();
    results = results.filter((p) => p.category.toLowerCase() === lowerCategory);
  }

  // Apply additional filters
  if (filters) {
    results = applyProductFilters(results, filters);
  }

  return { success: true, data: results };
}

/**
 * Apply product filters (price range, brands, labels, dietary flags).
 */
function applyProductFilters(products: Product[], filters: ProductFilters): Product[] {
  let filtered = products;

  if (filters.minPrice !== undefined) {
    filtered = filtered.filter((p) => p.price >= filters.minPrice!);
  }

  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter((p) => p.price <= filters.maxPrice!);
  }

  if (filters.brands && filters.brands.length > 0) {
    const lowerBrands = new Set(filters.brands.map((b) => b.toLowerCase()));
    filtered = filtered.filter((p) => lowerBrands.has(p.brand.toLowerCase()));
  }

  if (filters.labels && filters.labels.length > 0) {
    const lowerLabels = new Set(filters.labels.map((l) => l.toLowerCase()));
    filtered = filtered.filter((p) =>
      p.labels.some((label) => lowerLabels.has(label.toLowerCase()))
    );
  }

  if (filters.dietaryFlags && filters.dietaryFlags.length > 0) {
    const lowerFlags = new Set(filters.dietaryFlags.map((f) => f.toLowerCase()));
    filtered = filtered.filter((p) =>
      [...lowerFlags].every((flag) =>
        p.labels.some((label) => label.toLowerCase() === flag)
      )
    );
  }

  return filtered;
}

/**
 * Check quality tolerance for a product substitution.
 * Looks up both products in the catalog and computes the substitution score.
 */
async function handleCheckQualityTolerance(
  input: CheckQualityToleranceTool['input'],
  context: ToolContext
): Promise<ToolResult> {
  const { userId, originalProductId, substituteProductId } = input;

  if (!userId || !originalProductId || !substituteProductId) {
    return {
      success: false,
      data: { error: 'userId, originalProductId, and substituteProductId are required' },
    };
  }

  // Look up products in catalog
  const original = context.catalog.find((p) => p.productId === originalProductId);
  if (!original) {
    return {
      success: false,
      data: { error: `Original product not found: ${originalProductId}` },
    };
  }

  const substitute = context.catalog.find((p) => p.productId === substituteProductId);
  if (!substitute) {
    return {
      success: false,
      data: { error: `Substitute product not found: ${substituteProductId}` },
    };
  }

  // Get user profile for preference-based scoring
  const userProfile = await context.preferenceStore.getUserProfile(userId);
  if (!userProfile) {
    return {
      success: false,
      data: { error: `User profile not found for userId: ${userId}` },
    };
  }

  // Compute quality tolerance
  const result = computeQualityTolerance(original, substitute, userProfile);

  return {
    success: true,
    data: {
      score: result.score,
      acceptable: result.acceptable,
      reasons: result.reasons,
    },
  };
}

/**
 * Update the cart in the session store (add or remove a product).
 */
async function handleUpdateCart(
  input: UpdateCartTool['input'],
  context: ToolContext
): Promise<ToolResult> {
  const { sessionId, productId, action } = input;

  if (!sessionId || !productId || !action) {
    return {
      success: false,
      data: { error: 'sessionId, productId, and action are required' },
    };
  }

  // Get the current session
  const session = await context.sessionStore.getSession(sessionId);
  if (!session) {
    return {
      success: false,
      data: { error: `Session not found: ${sessionId}` },
    };
  }

  if (action === 'add') {
    // Find the product in the catalog
    const product = context.catalog.find((p) => p.productId === productId);
    if (!product) {
      return {
        success: false,
        data: { error: `Product not found in catalog: ${productId}` },
      };
    }

    // Check if product is already in cart
    const existingItem = session.cartState.find((item) => item.productId === productId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      const cartItem: CartItem = {
        productId: product.productId,
        name: product.name,
        price: product.price,
        quantity: 1,
      };
      session.cartState.push(cartItem);
    }
  } else if (action === 'remove') {
    const itemIndex = session.cartState.findIndex((item) => item.productId === productId);
    if (itemIndex === -1) {
      return {
        success: false,
        data: { error: `Product not in cart: ${productId}` },
      };
    }

    const item = session.cartState[itemIndex];
    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      session.cartState.splice(itemIndex, 1);
    }
  } else {
    return {
      success: false,
      data: { error: `Invalid action: ${action}. Must be 'add' or 'remove'` },
    };
  }

  // Calculate new cart total
  const cartTotal = session.cartState.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Persist updated session
  session.lastActivityAt = Date.now();
  await context.sessionStore.saveSession(sessionId, session);

  return {
    success: true,
    data: { success: true, cartTotal },
  };
}

// ─── Main Dispatch Function ──────────────────────────────────────────────────

/**
 * Dispatch a tool call to the appropriate handler.
 *
 * @param toolName - The name of the tool to invoke
 * @param input - The input parameters for the tool
 * @param context - Provider dependencies and catalog
 * @returns ToolResult with success status and data
 */
export async function dispatchTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  switch (toolName) {
    case 'lookup_preference':
      return handleLookupPreference(
        input as unknown as LookupPreferenceTool['input'],
        context
      );

    case 'search_products':
      return handleSearchProducts(
        input as unknown as SearchProductsTool['input'],
        context
      );

    case 'check_quality_tolerance':
      return handleCheckQualityTolerance(
        input as unknown as CheckQualityToleranceTool['input'],
        context
      );

    case 'update_cart':
      return handleUpdateCart(
        input as unknown as UpdateCartTool['input'],
        context
      );

    default:
      return {
        success: false,
        data: { error: `Unknown tool: ${toolName}` },
      };
  }
}
