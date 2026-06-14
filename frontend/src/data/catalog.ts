import productsJson from './products.json';

export interface Product {
  productId: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  imageUrl?: string;
  isOrganic: boolean;
  isLowSugar: boolean;
  isGlutenFree: boolean;
  containsPalmOil: boolean;
  qualityTier: 'budget' | 'mid' | 'premium';
  inStock: boolean;
  dietaryLabels: string[];
}

export const PRODUCTS: Product[] = productsJson as Product[];

/** Friendly label + emoji per category key. */
export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  milk: { label: 'Milk', icon: '🥛' },
  dairy: { label: 'Dairy', icon: '🧀' },
  bread: { label: 'Bakery', icon: '🍞' },
  cooking_oil: { label: 'Cooking Oil', icon: '🛢️' },
  rice: { label: 'Rice', icon: '🍚' },
  dal: { label: 'Dal & Pulses', icon: '🫘' },
  vegetables: { label: 'Vegetables', icon: '🥬' },
  fruits: { label: 'Fruits', icon: '🍎' },
  chocolate: { label: 'Chocolate', icon: '🍫' },
  snacks: { label: 'Snacks', icon: '🍪' },
  beverages: { label: 'Beverages', icon: '🥤' },
  personal_care: { label: 'Personal Care', icon: '🧴' },
  cleaning: { label: 'Cleaning', icon: '🧽' },
  spices: { label: 'Spices', icon: '🌶️' },
  flour: { label: 'Flour & Atta', icon: '🌾' },
  sugar: { label: 'Sugar & Sweet', icon: '🍯' },
  staples: { label: 'Staples', icon: '🧂' },
  breakfast: { label: 'Breakfast', icon: '🥣' },
  baby_care: { label: 'Baby Care', icon: '🍼' },
  pet_care: { label: 'Pet Care', icon: '🐾' },
};

export function categoryLabel(key: string): string {
  return CATEGORY_META[key]?.label ?? key;
}

export function categoryIcon(key: string): string {
  return CATEGORY_META[key]?.icon ?? '🛒';
}

/** Ordered list of categories that actually appear in the catalog. */
export const CATEGORIES: string[] = [...new Set(PRODUCTS.map((p) => p.category))];
