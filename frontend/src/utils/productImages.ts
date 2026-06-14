/**
 * Product image utilities — provides category-based fallback visuals
 * when real catalog images are unavailable.
 *
 * The recommendation flow must never break because an image is missing.
 */

/** Emoji icon per category, used to render a clean placeholder. */
const CATEGORY_ICONS: Record<string, string> = {
  milk: '🥛',
  dairy: '🧀',
  bread: '🍞',
  bakery: '🥖',
  cooking_oil: '🛢️',
  cooking: '🫗',
  rice: '🍚',
  grains: '🌾',
  dal: '🫘',
  pulses: '🫛',
  vegetables: '🥬',
  fruits: '🍎',
  chocolate: '🍫',
  snacks: '🍪',
  beverages: '🥤',
  personal_care: '🧴',
  cleaning: '🧽',
  household: '🧹',
  spices: '🌶️',
  flour: '🌾',
  sugar: '🍯',
  staples: '🧂',
  spreads: '🍓',
  protein: '🥚',
  essentials: '🧂',
};

/** Background gradient per category for visual variety. */
const CATEGORY_COLORS: Record<string, string> = {
  milk: '#e0f2fe',
  dairy: '#fef9c3',
  bread: '#fef3c7',
  bakery: '#fde68a',
  cooking_oil: '#fef9c3',
  cooking: '#fef9c3',
  rice: '#f0fdf4',
  grains: '#fef3c7',
  dal: '#fef3c7',
  pulses: '#ecfccb',
  vegetables: '#dcfce7',
  fruits: '#fee2e2',
  chocolate: '#f5e6d3',
  snacks: '#fef3c7',
  beverages: '#dbeafe',
  personal_care: '#f3e8ff',
  cleaning: '#cffafe',
  household: '#e0e7ff',
  spices: '#fee2e2',
  flour: '#fef3c7',
  sugar: '#fef9c3',
  staples: '#f3f4f6',
  spreads: '#fce7f3',
};

const DEFAULT_ICON = '🛒';
const DEFAULT_COLOR = '#f3f4f6';

/**
 * Infer a category key from a product name when category metadata is absent.
 */
export function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('milk')) return 'milk';
  if (n.includes('bread')) return 'bread';
  if (n.includes('oil')) return 'cooking_oil';
  if (n.includes('rice')) return 'rice';
  if (n.includes('dal')) return 'dal';
  if (n.includes('butter') || n.includes('paneer') || n.includes('dahi') || n.includes('curd') || n.includes('yogurt')) return 'dairy';
  if (n.includes('chocolate') || n.includes('kitkat') || n.includes('dairy milk')) return 'chocolate';
  if (n.includes('tea') || n.includes('coffee') || n.includes('panna')) return 'beverages';
  if (n.includes('biscuit') || n.includes('chips') || n.includes('bhujia') || n.includes('namkeen')) return 'snacks';
  if (n.includes('soap') || n.includes('shampoo') || n.includes('toothpaste') || n.includes('face wash')) return 'personal_care';
  if (n.includes('detergent') || n.includes('dishwash') || n.includes('cleaner')) return 'cleaning';
  if (n.includes('masala') || n.includes('turmeric') || n.includes('garam')) return 'spices';
  if (n.includes('atta') || n.includes('flour')) return 'flour';
  if (n.includes('sugar') || n.includes('honey')) return 'sugar';
  if (n.includes('salt') || n.includes('jam') || n.includes('maggi') || n.includes('noodle')) return 'staples';
  if (n.includes('tomato') || n.includes('onion') || n.includes('spinach') || n.includes('potato')) return 'vegetables';
  return 'default';
}

export function getCategoryIcon(category?: string, name?: string): string {
  const key = category || (name ? inferCategory(name) : 'default');
  return CATEGORY_ICONS[key] ?? DEFAULT_ICON;
}

export function getCategoryColor(category?: string, name?: string): string {
  const key = category || (name ? inferCategory(name) : 'default');
  return CATEGORY_COLORS[key] ?? DEFAULT_COLOR;
}

/**
 * Build a data-URI SVG placeholder image for a product.
 * This guarantees a clean visual even with zero network requests.
 */
export function buildPlaceholderDataUri(category?: string, name?: string): string {
  const icon = getCategoryIcon(category, name);
  const bg = getCategoryColor(category, name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect width="120" height="120" fill="${bg}"/>
    <text x="60" y="60" font-size="56" text-anchor="middle" dominant-baseline="central">${icon}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
