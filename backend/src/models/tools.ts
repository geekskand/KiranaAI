/**
 * Agent tool interfaces for KiranaAI.
 * Defines the tool contracts used by the AI agent for product search,
 * preference lookup, quality tolerance checks, and cart management.
 * Requirements: 8.1, 9.1
 */

import type { CategoryPreferences, Product, UserProfile } from './types.js';

// ─── Product Filters ─────────────────────────────────────────────────────────

export interface ProductFilters {
  minPrice?: number;
  maxPrice?: number;
  brands?: string[];
  labels?: string[];
  dietaryFlags?: string[];
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export interface LookupPreferenceTool {
  name: 'lookup_preference';
  input: {
    userId: string;
    category?: string;
  };
  output: UserProfile | CategoryPreferences;
}

export interface SearchProductsTool {
  name: 'search_products';
  input: {
    query: string;
    category?: string;
    filters?: ProductFilters;
  };
  output: Product[];
}

export interface CheckQualityToleranceTool {
  name: 'check_quality_tolerance';
  input: {
    userId: string;
    originalProductId: string;
    substituteProductId: string;
  };
  output: {
    score: number;
    acceptable: boolean;
    reasons: string[];
  };
}

export interface UpdateCartTool {
  name: 'update_cart';
  input: {
    sessionId: string;
    productId: string;
    action: 'add' | 'remove';
  };
  output: {
    success: boolean;
    cartTotal: number;
  };
}

// ─── Union Type for All Tools ────────────────────────────────────────────────

export type AgentTool =
  | LookupPreferenceTool
  | SearchProductsTool
  | CheckQualityToleranceTool
  | UpdateCartTool;

export type AgentToolName = AgentTool['name'];
