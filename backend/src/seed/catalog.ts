/**
 * 50-SKU Product Catalog Seed Data for KiranaAI.
 *
 * Provides a realistic Indian grocery catalog spanning 10+ categories with
 * products from well-known Indian brands. Includes dietary labels, quality tiers,
 * and health attributes for persona-based demos.
 *
 * Co-occurrence rules define basket completion companions for the
 * Basket Completion Engine.
 *
 * Requirements: 10.1
 */

import type { Product } from '../models/index.js';

// ─── Extended Product Type for Seed Data ─────────────────────────────────────

export interface CatalogProduct extends Product {
  dietaryLabels: string[];
  isOrganic: boolean;
  isLowSugar: boolean;
  isGlutenFree: boolean;
  containsPalmOil: boolean;
  qualityTier: 'budget' | 'mid' | 'premium';
  inStock: boolean;
}

// ─── Co-occurrence Rule Type ─────────────────────────────────────────────────

export interface CatalogCoOccurrenceRule {
  /** Product ID that triggers the rule */
  triggerProductId: string;
  /** Trigger product name (for readability) */
  triggerName: string;
  /** Companion products suggested when trigger is in cart */
  companions: {
    productId: string;
    name: string;
    frequency: number;
    reason: string;
  }[];
}

// ─── 50-SKU Curated Product Catalog ──────────────────────────────────────────

const curatedProducts: CatalogProduct[] = [
  // ─── Milk (Category: milk) ───────────────────────────────────────────────
  {
    productId: 'milk-001',
    name: 'Amul Taaza Toned Milk',
    brand: 'Amul',
    category: 'milk',
    price: 28,
    labels: ['toned', 'pasteurized'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'milk-002',
    name: 'Mother Dairy Full Cream Milk',
    brand: 'Mother Dairy',
    category: 'milk',
    price: 35,
    labels: ['full-cream', 'pasteurized'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'milk-003',
    name: 'Organic Tattva A2 Cow Milk',
    brand: 'Organic Tattva',
    category: 'milk',
    price: 72,
    labels: ['a2', 'organic', 'full-cream'],
    dietaryLabels: ['vegetarian', 'organic'],
    isOrganic: true,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Bread (Category: bread) ─────────────────────────────────────────────
  {
    productId: 'bread-001',
    name: 'Britannia White Bread',
    brand: 'Britannia',
    category: 'bread',
    price: 40,
    labels: ['white-bread'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: true,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'bread-002',
    name: 'Britannia Whole Wheat Bread',
    brand: 'Britannia',
    category: 'bread',
    price: 50,
    labels: ['whole-wheat', 'high-fiber'],
    dietaryLabels: ['vegetarian', 'high-fiber'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'bread-003',
    name: 'Patanjali Multigrain Bread',
    brand: 'Patanjali',
    category: 'bread',
    price: 45,
    labels: ['multigrain', 'no-preservatives'],
    dietaryLabels: ['vegetarian', 'no-preservatives'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },

  // ─── Cooking Oil (Category: cooking_oil) ─────────────────────────────────
  {
    productId: 'oil-001',
    name: 'Fortune Sunflower Oil 1L',
    brand: 'Fortune',
    category: 'cooking_oil',
    price: 140,
    labels: ['sunflower', 'refined'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'oil-002',
    name: 'Fortune Rice Bran Oil 1L',
    brand: 'Fortune',
    category: 'cooking_oil',
    price: 175,
    labels: ['rice-bran', 'heart-healthy'],
    dietaryLabels: ['vegan', 'gluten-free', 'heart-healthy'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'oil-003',
    name: 'Patanjali Cold Pressed Mustard Oil 1L',
    brand: 'Patanjali',
    category: 'cooking_oil',
    price: 210,
    labels: ['mustard', 'cold-pressed', 'organic'],
    dietaryLabels: ['vegan', 'gluten-free', 'organic'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Rice (Category: rice) ───────────────────────────────────────────────
  {
    productId: 'rice-001',
    name: 'Tata Sampann Basmati Rice 1kg',
    brand: 'Tata',
    category: 'rice',
    price: 110,
    labels: ['basmati', 'aged'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'rice-002',
    name: 'Aashirvaad Superior Basmati Rice 1kg',
    brand: 'Aashirvaad',
    category: 'rice',
    price: 165,
    labels: ['basmati', 'extra-long-grain'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'rice-003',
    name: 'Organic Tattva Brown Rice 1kg',
    brand: 'Organic Tattva',
    category: 'rice',
    price: 195,
    labels: ['brown-rice', 'organic', 'high-fiber'],
    dietaryLabels: ['vegan', 'gluten-free', 'organic', 'high-fiber'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Dal / Pulses (Category: dal) ────────────────────────────────────────
  {
    productId: 'dal-001',
    name: 'Tata Sampann Toor Dal 1kg',
    brand: 'Tata',
    category: 'dal',
    price: 130,
    labels: ['toor', 'unpolished'],
    dietaryLabels: ['vegan', 'gluten-free', 'high-protein'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'dal-002',
    name: 'Aashirvaad Moong Dal 1kg',
    brand: 'Aashirvaad',
    category: 'dal',
    price: 160,
    labels: ['moong', 'split'],
    dietaryLabels: ['vegan', 'gluten-free', 'high-protein'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'dal-003',
    name: 'Patanjali Organic Chana Dal 1kg',
    brand: 'Patanjali',
    category: 'dal',
    price: 145,
    labels: ['chana', 'organic'],
    dietaryLabels: ['vegan', 'gluten-free', 'organic', 'high-protein'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },

  // ─── Vegetables (Category: vegetables) ───────────────────────────────────
  {
    productId: 'veg-001',
    name: 'Fresh Tomatoes 500g',
    brand: 'Local Farm',
    category: 'vegetables',
    price: 30,
    labels: ['fresh', 'seasonal'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'veg-002',
    name: 'Fresh Onions 1kg',
    brand: 'Local Farm',
    category: 'vegetables',
    price: 35,
    labels: ['fresh', 'staple'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'veg-003',
    name: 'Organic Spinach 250g',
    brand: 'Organic Tattva',
    category: 'vegetables',
    price: 45,
    labels: ['organic', 'leafy-green', 'iron-rich'],
    dietaryLabels: ['vegan', 'gluten-free', 'organic'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },


  // ─── Chocolate (Category: chocolate) ─────────────────────────────────────
  {
    productId: 'choc-001',
    name: 'Cadbury Dairy Milk 50g',
    brand: 'Cadbury',
    category: 'chocolate',
    price: 45,
    labels: ['milk-chocolate'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: true,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'choc-002',
    name: 'Amul Dark Chocolate 150g',
    brand: 'Amul',
    category: 'chocolate',
    price: 120,
    labels: ['dark-chocolate', '75%-cocoa'],
    dietaryLabels: ['vegetarian', 'low-sugar'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'choc-003',
    name: 'Nestle KitKat Sugar-Free 40g',
    brand: 'Nestle',
    category: 'chocolate',
    price: 80,
    labels: ['sugar-free', 'wafer'],
    dietaryLabels: ['vegetarian', 'low-sugar'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: true,
    qualityTier: 'mid',
    inStock: true,
  },

  // ─── Snacks (Category: snacks) ───────────────────────────────────────────
  {
    productId: 'snack-001',
    name: 'Parle Monaco Biscuits 200g',
    brand: 'Parle',
    category: 'snacks',
    price: 30,
    labels: ['salted', 'biscuit'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: true,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'snack-002',
    name: 'Haldirams Aloo Bhujia 200g',
    brand: "Haldiram's",
    category: 'snacks',
    price: 55,
    labels: ['namkeen', 'spicy'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: true,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'snack-003',
    name: 'ITC Bingo Mad Angles 60g',
    brand: 'ITC',
    category: 'snacks',
    price: 20,
    labels: ['chips', 'tangy'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: true,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'snack-004',
    name: 'Yoga Bar Multigrain Chips 85g',
    brand: 'Yoga Bar',
    category: 'snacks',
    price: 99,
    labels: ['multigrain', 'baked', 'no-palm-oil'],
    dietaryLabels: ['vegan', 'high-fiber'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },


  // ─── Beverages (Category: beverages) ─────────────────────────────────────
  {
    productId: 'bev-001',
    name: 'Tata Tea Gold 250g',
    brand: 'Tata',
    category: 'beverages',
    price: 120,
    labels: ['black-tea', 'ctc'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'bev-002',
    name: 'Nescafe Classic Instant Coffee 100g',
    brand: 'Nestle',
    category: 'beverages',
    price: 210,
    labels: ['instant-coffee', 'arabica-blend'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'bev-003',
    name: 'Paper Boat Aam Panna 200ml',
    brand: 'Paper Boat',
    category: 'beverages',
    price: 30,
    labels: ['mango', 'traditional', 'no-preservatives'],
    dietaryLabels: ['vegan', 'gluten-free', 'no-preservatives'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'bev-004',
    name: 'Organic India Tulsi Green Tea 25 bags',
    brand: 'Organic India',
    category: 'beverages',
    price: 175,
    labels: ['green-tea', 'tulsi', 'organic', 'antioxidant'],
    dietaryLabels: ['vegan', 'gluten-free', 'organic', 'low-sugar'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },


  // ─── Personal Care (Category: personal_care) ─────────────────────────────
  {
    productId: 'pc-001',
    name: 'Dove Soap Bar 100g',
    brand: 'Hindustan Unilever',
    category: 'personal_care',
    price: 55,
    labels: ['moisturizing', 'soap'],
    dietaryLabels: [],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: true,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'pc-002',
    name: 'Patanjali Dant Kanti Toothpaste 100g',
    brand: 'Patanjali',
    category: 'personal_care',
    price: 45,
    labels: ['herbal', 'toothpaste', 'ayurvedic'],
    dietaryLabels: ['herbal'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'pc-003',
    name: 'Himalaya Neem Face Wash 150ml',
    brand: 'Himalaya',
    category: 'personal_care',
    price: 135,
    labels: ['neem', 'herbal', 'face-wash'],
    dietaryLabels: ['herbal'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'pc-004',
    name: 'Mamaearth Onion Shampoo 250ml',
    brand: 'Mamaearth',
    category: 'personal_care',
    price: 349,
    labels: ['shampoo', 'sulfate-free', 'organic', 'no-toxins'],
    dietaryLabels: ['organic', 'toxin-free'],
    isOrganic: true,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Cleaning (Category: cleaning) ───────────────────────────────────────
  {
    productId: 'clean-001',
    name: 'Vim Dishwash Liquid 500ml',
    brand: 'Hindustan Unilever',
    category: 'cleaning',
    price: 99,
    labels: ['dishwash', 'lemon'],
    dietaryLabels: [],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: true,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'clean-002',
    name: 'Surf Excel Liquid Detergent 1L',
    brand: 'Hindustan Unilever',
    category: 'cleaning',
    price: 199,
    labels: ['detergent', 'liquid', 'top-load'],
    dietaryLabels: [],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: true,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'clean-003',
    name: 'Herbal Strategi Floor Cleaner 500ml',
    brand: 'Herbal Strategi',
    category: 'cleaning',
    price: 249,
    labels: ['herbal', 'floor-cleaner', 'no-chemicals', 'organic'],
    dietaryLabels: ['organic', 'eco-friendly'],
    isOrganic: true,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Spices & Masala (Category: spices) ───────────────────────────────────
  {
    productId: 'spice-001',
    name: 'MDH Garam Masala 100g',
    brand: 'MDH',
    category: 'spices',
    price: 72,
    labels: ['masala', 'blend'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'spice-002',
    name: 'MDH Chana Masala 100g',
    brand: 'MDH',
    category: 'spices',
    price: 65,
    labels: ['masala', 'curry-blend'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'spice-003',
    name: 'Organic Tattva Turmeric Powder 100g',
    brand: 'Organic Tattva',
    category: 'spices',
    price: 89,
    labels: ['turmeric', 'organic', 'anti-inflammatory'],
    dietaryLabels: ['vegan', 'gluten-free', 'organic'],
    isOrganic: true,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Dairy (Category: dairy) ─────────────────────────────────────────────
  {
    productId: 'dairy-001',
    name: 'Amul Butter 100g',
    brand: 'Amul',
    category: 'dairy',
    price: 56,
    labels: ['butter', 'salted'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'dairy-002',
    name: 'Mother Dairy Dahi 400g',
    brand: 'Mother Dairy',
    category: 'dairy',
    price: 35,
    labels: ['yogurt', 'probiotic'],
    dietaryLabels: ['vegetarian', 'probiotic'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'dairy-003',
    name: 'Amul Paneer 200g',
    brand: 'Amul',
    category: 'dairy',
    price: 90,
    labels: ['paneer', 'high-protein'],
    dietaryLabels: ['vegetarian', 'high-protein'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'dairy-004',
    name: 'Epigamia Greek Yogurt 90g',
    brand: 'Epigamia',
    category: 'dairy',
    price: 60,
    labels: ['greek-yogurt', 'high-protein', 'low-fat'],
    dietaryLabels: ['vegetarian', 'high-protein', 'low-sugar'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'premium',
    inStock: true,
  },

  // ─── Atta / Flour (Category: flour) ──────────────────────────────────────
  {
    productId: 'flour-001',
    name: 'Aashirvaad Whole Wheat Atta 5kg',
    brand: 'Aashirvaad',
    category: 'flour',
    price: 265,
    labels: ['whole-wheat', 'atta'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'flour-002',
    name: 'Aashirvaad Multigrain Atta 5kg',
    brand: 'Aashirvaad',
    category: 'flour',
    price: 320,
    labels: ['multigrain', 'atta', 'high-fiber'],
    dietaryLabels: ['vegetarian', 'high-fiber'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },

  // ─── Sugar & Sweeteners (Category: sugar) ────────────────────────────────
  {
    productId: 'sugar-001',
    name: 'Tata Sugar White 1kg',
    brand: 'Tata',
    category: 'sugar',
    price: 42,
    labels: ['refined', 'white-sugar'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'sugar-002',
    name: 'Dabur Honey 500g',
    brand: 'Dabur',
    category: 'sugar',
    price: 225,
    labels: ['honey', 'natural-sweetener'],
    dietaryLabels: ['vegetarian', 'natural'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },

  // ─── Staples / Condiments (Category: staples) ────────────────────────────
  {
    productId: 'staple-001',
    name: 'Tata Salt 1kg',
    brand: 'Tata',
    category: 'staples',
    price: 24,
    labels: ['iodized', 'salt'],
    dietaryLabels: ['vegan', 'gluten-free'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'budget',
    inStock: true,
  },
  {
    productId: 'staple-002',
    name: 'Kissan Mixed Fruit Jam 200g',
    brand: 'Hindustan Unilever',
    category: 'staples',
    price: 95,
    labels: ['jam', 'mixed-fruit'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: true,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
  },
  {
    productId: 'staple-003',
    name: 'Maggi 2-Minute Noodles Pack of 4',
    brand: 'Nestle',
    category: 'staples',
    price: 56,
    labels: ['instant-noodles', 'quick-meal'],
    dietaryLabels: ['vegetarian'],
    isOrganic: false,
    isLowSugar: true,
    isGlutenFree: false,
    containsPalmOil: true,
    qualityTier: 'budget',
    inStock: true,
  },

];

// ─── Co-occurrence Rules for Basket Completion ───────────────────────────────

export const coOccurrenceRules: CatalogCoOccurrenceRule[] = [
  {
    triggerProductId: 'veg-001',
    triggerName: 'Tomatoes',
    companions: [
      { productId: 'veg-002', name: 'Onions', frequency: 0.80, reason: 'Tomato-onion base for curries' },
      { productId: 'oil-001', name: 'Cooking Oil', frequency: 0.65, reason: 'Needed for cooking' },
      { productId: 'spice-001', name: 'Garam Masala', frequency: 0.55, reason: 'Spice for tomato dishes' },
    ],
  },
  {
    triggerProductId: 'dal-001',
    triggerName: 'Toor Dal',
    companions: [
      { productId: 'rice-001', name: 'Basmati Rice', frequency: 0.90, reason: 'Dal-rice is a staple combo' },
      { productId: 'spice-003', name: 'Turmeric', frequency: 0.70, reason: 'Essential for dal preparation' },
      { productId: 'veg-002', name: 'Onions', frequency: 0.65, reason: 'Tadka ingredients' },
    ],
  },
  {
    triggerProductId: 'bread-001',
    triggerName: 'White Bread',
    companions: [
      { productId: 'dairy-001', name: 'Butter', frequency: 0.82, reason: 'Bread and butter go together' },
      { productId: 'staple-002', name: 'Jam', frequency: 0.78, reason: 'Classic breakfast spread' },
      { productId: 'milk-001', name: 'Milk', frequency: 0.55, reason: 'Breakfast beverage' },
    ],
  },
  {
    triggerProductId: 'bev-001',
    triggerName: 'Tea',
    companions: [
      { productId: 'sugar-001', name: 'Sugar', frequency: 0.88, reason: 'Sugar for tea' },
      { productId: 'milk-001', name: 'Milk', frequency: 0.85, reason: 'Milk for chai' },
      { productId: 'snack-001', name: 'Biscuits', frequency: 0.60, reason: 'Tea-time snack' },
    ],
  },
  {
    triggerProductId: 'rice-001',
    triggerName: 'Basmati Rice',
    companions: [
      { productId: 'dal-001', name: 'Toor Dal', frequency: 0.88, reason: 'Rice and dal staple pair' },
      { productId: 'oil-001', name: 'Cooking Oil', frequency: 0.70, reason: 'Used in rice preparation' },
      { productId: 'spice-001', name: 'Garam Masala', frequency: 0.55, reason: 'Biryani and pulao spice' },
    ],
  },
  {
    triggerProductId: 'milk-001',
    triggerName: 'Toned Milk',
    companions: [
      { productId: 'bread-001', name: 'Bread', frequency: 0.75, reason: 'Breakfast essentials' },
      { productId: 'bev-001', name: 'Tea', frequency: 0.72, reason: 'Chai preparation' },
      { productId: 'sugar-001', name: 'Sugar', frequency: 0.60, reason: 'Sweetener for milk' },
    ],
  },
  {
    triggerProductId: 'oil-001',
    triggerName: 'Sunflower Oil',
    companions: [
      { productId: 'veg-002', name: 'Onions', frequency: 0.72, reason: 'Cooking base ingredient' },
      { productId: 'spice-001', name: 'Garam Masala', frequency: 0.60, reason: 'Complete cooking setup' },
      { productId: 'staple-001', name: 'Salt', frequency: 0.55, reason: 'Basic seasoning' },
    ],
  },
  {
    triggerProductId: 'staple-003',
    triggerName: 'Maggi Noodles',
    companions: [
      { productId: 'veg-002', name: 'Onions', frequency: 0.60, reason: 'Quick noodle add-in' },
      { productId: 'veg-001', name: 'Tomatoes', frequency: 0.55, reason: 'Add flavor to noodles' },
      { productId: 'oil-001', name: 'Cooking Oil', frequency: 0.50, reason: 'Stir-fry noodles' },
    ],
  },
  {
    triggerProductId: 'bev-002',
    triggerName: 'Coffee',
    companions: [
      { productId: 'sugar-001', name: 'Sugar', frequency: 0.82, reason: 'Sweetener for coffee' },
      { productId: 'milk-001', name: 'Milk', frequency: 0.78, reason: 'Milk for coffee' },
      { productId: 'snack-001', name: 'Biscuits', frequency: 0.50, reason: 'Coffee-time snack' },
    ],
  },
  {
    triggerProductId: 'dairy-001',
    triggerName: 'Butter',
    companions: [
      { productId: 'bread-001', name: 'Bread', frequency: 0.82, reason: 'Classic bread and butter' },
      { productId: 'staple-002', name: 'Jam', frequency: 0.60, reason: 'Breakfast spreads together' },
      { productId: 'flour-001', name: 'Wheat Atta', frequency: 0.45, reason: 'Butter on hot rotis' },
    ],
  },
  {
    triggerProductId: 'veg-002',
    triggerName: 'Onions',
    companions: [
      { productId: 'veg-001', name: 'Tomatoes', frequency: 0.78, reason: 'Base for Indian cooking' },
      { productId: 'oil-001', name: 'Cooking Oil', frequency: 0.68, reason: 'Frying onions' },
      { productId: 'spice-001', name: 'Garam Masala', frequency: 0.55, reason: 'Common spice pairing' },
    ],
  },
  {
    triggerProductId: 'pc-001',
    triggerName: 'Soap',
    companions: [
      { productId: 'pc-004', name: 'Shampoo', frequency: 0.72, reason: 'Bathing essentials together' },
      { productId: 'pc-002', name: 'Toothpaste', frequency: 0.55, reason: 'Personal care bundle' },
    ],
  },
  {
    triggerProductId: 'flour-001',
    triggerName: 'Wheat Atta',
    companions: [
      { productId: 'oil-001', name: 'Cooking Oil', frequency: 0.65, reason: 'For making rotis' },
      { productId: 'dairy-001', name: 'Butter', frequency: 0.55, reason: 'Butter on rotis' },
      { productId: 'dal-001', name: 'Toor Dal', frequency: 0.50, reason: 'Dal-roti staple meal' },
    ],
  },
  {
    triggerProductId: 'snack-002',
    triggerName: 'Aloo Bhujia',
    companions: [
      { productId: 'bev-001', name: 'Tea', frequency: 0.68, reason: 'Classic chai-time namkeen' },
      { productId: 'bev-003', name: 'Aam Panna', frequency: 0.45, reason: 'Refreshing drink with snack' },
    ],
  },
  {
    triggerProductId: 'dairy-003',
    triggerName: 'Paneer',
    companions: [
      { productId: 'veg-002', name: 'Onions', frequency: 0.70, reason: 'Base for paneer dishes' },
      { productId: 'veg-001', name: 'Tomatoes', frequency: 0.68, reason: 'Paneer butter masala base' },
      { productId: 'spice-001', name: 'Garam Masala', frequency: 0.65, reason: 'Essential paneer spice' },
    ],
  },
];


// ─── Image URL helper ────────────────────────────────────────────────────────

/**
 * Build a real product photo URL from loremflickr (keyword-based real photos).
 * Deterministic per product via the `lock` seed, so the same product always
 * shows the same image. No API key required.
 */
function imageFor(keyword: string, seed: number): string {
  const kw = encodeURIComponent(keyword.replace(/[^a-z0-9 ]/gi, '').trim() || 'grocery');
  return `https://loremflickr.com/320/320/${kw}?lock=${seed}`;
}

// ─── Catalog Generator (scales the catalog to ~500 SKUs) ─────────────────────

interface CategoryTemplate {
  category: string;
  /** image search keyword */
  imageKeyword: string;
  nouns: string[];
  brands: string[];
  variants: string[];
  sizes: string[];
  priceRange: [number, number];
  glutenFree: boolean;
  defaultPalmOil: boolean;
}

const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  { category: 'milk', imageKeyword: 'milk carton', nouns: ['Toned Milk', 'Full Cream Milk', 'Double Toned Milk', 'A2 Milk', 'Slim Milk'], brands: ['Amul', 'Mother Dairy', 'Nestle', 'Organic Tattva', 'Country Delight', 'Heritage'], variants: ['', 'Fortified', 'Premium'], sizes: ['500ml', '1L'], priceRange: [26, 80], glutenFree: true, defaultPalmOil: false },
  { category: 'dairy', imageKeyword: 'dairy products', nouns: ['Butter', 'Paneer', 'Cheese Slices', 'Dahi', 'Greek Yogurt', 'Ghee', 'Cream'], brands: ['Amul', 'Mother Dairy', 'Britannia', 'Epigamia', 'Gowardhan', 'Nandini'], variants: ['', 'Low Fat', 'Salted', 'Unsalted'], sizes: ['100g', '200g', '400g'], priceRange: [35, 320], glutenFree: true, defaultPalmOil: false },
  { category: 'bread', imageKeyword: 'bread loaf', nouns: ['White Bread', 'Whole Wheat Bread', 'Multigrain Bread', 'Brown Bread', 'Pav', 'Bun'], brands: ['Britannia', 'Harvest Gold', 'English Oven', 'Modern', 'Patanjali'], variants: ['', 'High Fiber', 'No Maida'], sizes: ['400g', '500g'], priceRange: [30, 70], glutenFree: false, defaultPalmOil: true },
  { category: 'cooking_oil', imageKeyword: 'cooking oil bottle', nouns: ['Sunflower Oil', 'Mustard Oil', 'Rice Bran Oil', 'Groundnut Oil', 'Olive Oil', 'Soybean Oil'], brands: ['Fortune', 'Saffola', 'Dhara', 'Patanjali', 'Figaro', 'Gemini'], variants: ['', 'Cold Pressed', 'Refined', 'Filtered'], sizes: ['500ml', '1L', '2L'], priceRange: [120, 420], glutenFree: true, defaultPalmOil: false },
  { category: 'rice', imageKeyword: 'rice grains', nouns: ['Basmati Rice', 'Brown Rice', 'Sona Masoori Rice', 'Idli Rice', 'Jasmine Rice'], brands: ['India Gate', 'Daawat', 'Tata', 'Aashirvaad', 'Organic Tattva', 'Kohinoor'], variants: ['', 'Premium', 'Aged', 'Organic'], sizes: ['1kg', '5kg'], priceRange: [90, 520], glutenFree: true, defaultPalmOil: false },
  { category: 'dal', imageKeyword: 'lentils dal', nouns: ['Toor Dal', 'Moong Dal', 'Chana Dal', 'Masoor Dal', 'Urad Dal', 'Rajma'], brands: ['Tata Sampann', 'Aashirvaad', 'Patanjali', 'Organic Tattva', '24 Mantra'], variants: ['', 'Unpolished', 'Organic'], sizes: ['500g', '1kg'], priceRange: [70, 220], glutenFree: true, defaultPalmOil: false },
  { category: 'vegetables', imageKeyword: 'fresh vegetables', nouns: ['Tomatoes', 'Onions', 'Potatoes', 'Spinach', 'Cauliflower', 'Carrots', 'Green Peas', 'Capsicum'], brands: ['Local Farm', 'Organic Tattva', 'Fresho', 'Simpli Namdhari'], variants: ['', 'Organic', 'Hydroponic'], sizes: ['250g', '500g', '1kg'], priceRange: [20, 120], glutenFree: true, defaultPalmOil: false },
  { category: 'fruits', imageKeyword: 'fresh fruits', nouns: ['Apples', 'Bananas', 'Oranges', 'Grapes', 'Pomegranate', 'Mangoes', 'Papaya'], brands: ['Local Farm', 'Fresho', 'Organic Tattva', 'Simpli Namdhari'], variants: ['', 'Premium', 'Organic'], sizes: ['500g', '1kg'], priceRange: [40, 260], glutenFree: true, defaultPalmOil: false },
  { category: 'chocolate', imageKeyword: 'chocolate bar', nouns: ['Dark Chocolate', 'Milk Chocolate', 'Hazelnut Chocolate', 'Fruit & Nut Bar', 'Wafer Bar'], brands: ['Cadbury', 'Nestle', 'Amul', 'Lindt', 'Bournville', 'Paul & Mike'], variants: ['', 'Sugar-Free', '70% Cocoa', '99% Cocoa'], sizes: ['40g', '100g', '150g'], priceRange: [40, 320], glutenFree: true, defaultPalmOil: true },
  { category: 'snacks', imageKeyword: 'snacks chips', nouns: ['Potato Chips', 'Aloo Bhujia', 'Mixture', 'Multigrain Chips', 'Nachos', 'Popcorn'], brands: ['Lays', "Haldiram's", 'Bingo', 'Yoga Bar', 'Too Yumm', 'Kurkure'], variants: ['', 'Baked', 'No Palm Oil', 'Masala'], sizes: ['50g', '85g', '150g'], priceRange: [20, 110], glutenFree: false, defaultPalmOil: true },
  { category: 'beverages', imageKeyword: 'tea coffee', nouns: ['Green Tea', 'Black Tea', 'Instant Coffee', 'Filter Coffee', 'Iced Tea', 'Cold Brew'], brands: ['Tata Tea', 'Nescafe', 'Organic India', 'Bru', 'Red Label', 'Society'], variants: ['', 'Premium', 'Decaf', 'Tulsi'], sizes: ['100g', '250g', '500g'], priceRange: [60, 420], glutenFree: true, defaultPalmOil: false },
  { category: 'personal_care', imageKeyword: 'soap shampoo', nouns: ['Shampoo', 'Soap Bar', 'Body Wash', 'Toothpaste', 'Face Wash', 'Hand Wash'], brands: ['Dove', 'Patanjali', 'Himalaya', 'Mamaearth', 'Dettol', 'Colgate'], variants: ['', 'Herbal', 'Sulfate-Free', 'Sensitive'], sizes: ['100g', '150ml', '250ml'], priceRange: [40, 380], glutenFree: true, defaultPalmOil: true },
  { category: 'cleaning', imageKeyword: 'cleaning supplies', nouns: ['Dishwash Liquid', 'Detergent Powder', 'Floor Cleaner', 'Toilet Cleaner', 'Glass Cleaner'], brands: ['Vim', 'Surf Excel', 'Harpic', 'Lizol', 'Herbal Strategi', 'Ariel'], variants: ['', 'Lemon', 'Eco-Friendly', 'Concentrated'], sizes: ['500ml', '1L', '1kg'], priceRange: [60, 350], glutenFree: true, defaultPalmOil: true },
  { category: 'spices', imageKeyword: 'indian spices', nouns: ['Garam Masala', 'Turmeric Powder', 'Chilli Powder', 'Coriander Powder', 'Chana Masala', 'Cumin Seeds'], brands: ['MDH', 'Everest', 'Catch', 'Tata Sampann', 'Organic Tattva', '24 Mantra'], variants: ['', 'Organic', 'Premium'], sizes: ['50g', '100g', '200g'], priceRange: [40, 180], glutenFree: true, defaultPalmOil: false },
  { category: 'flour', imageKeyword: 'wheat flour', nouns: ['Whole Wheat Atta', 'Multigrain Atta', 'Maida', 'Besan', 'Rava', 'Ragi Flour'], brands: ['Aashirvaad', 'Pillsbury', 'Patanjali', 'Fortune', '24 Mantra'], variants: ['', 'Multigrain', 'High Fiber', 'Organic'], sizes: ['1kg', '5kg'], priceRange: [50, 360], glutenFree: false, defaultPalmOil: false },
  { category: 'sugar', imageKeyword: 'sugar honey', nouns: ['White Sugar', 'Brown Sugar', 'Honey', 'Jaggery', 'Stevia', 'Date Syrup'], brands: ['Tata', 'Dabur', 'Madhusudan', 'Patanjali', 'Organic India'], variants: ['', 'Raw', 'Organic', 'Natural'], sizes: ['250g', '500g', '1kg'], priceRange: [40, 320], glutenFree: true, defaultPalmOil: false },
  { category: 'staples', imageKeyword: 'grocery staples', nouns: ['Iodized Salt', 'Mixed Fruit Jam', 'Instant Noodles', 'Tomato Ketchup', 'Pasta', 'Vermicelli'], brands: ['Tata', 'Kissan', 'Maggi', 'Nestle', 'Del Monte', 'Sunfeast'], variants: ['', 'No Onion Garlic', 'Whole Wheat'], sizes: ['200g', '500g', '1kg'], priceRange: [20, 160], glutenFree: false, defaultPalmOil: true },
  { category: 'breakfast', imageKeyword: 'breakfast cereal', nouns: ['Corn Flakes', 'Muesli', 'Oats', 'Granola', 'Poha', 'Upma Mix'], brands: ['Kelloggs', 'Bagrrys', 'Quaker', 'Yoga Bar', 'True Elements'], variants: ['', 'No Added Sugar', 'Fruit & Nut', 'High Protein'], sizes: ['250g', '400g', '1kg'], priceRange: [80, 460], glutenFree: false, defaultPalmOil: false },
  { category: 'baby_care', imageKeyword: 'baby products', nouns: ['Baby Diapers', 'Baby Wipes', 'Baby Lotion', 'Baby Food', 'Baby Shampoo'], brands: ['Pampers', 'Huggies', 'Johnsons', 'Mamaearth', 'Cerelac'], variants: ['', 'Sensitive', 'Organic'], sizes: ['Small', 'Medium', 'Large'], priceRange: [120, 720], glutenFree: true, defaultPalmOil: false },
  { category: 'pet_care', imageKeyword: 'pet food', nouns: ['Dog Food', 'Cat Food', 'Dog Treats', 'Cat Litter'], brands: ['Pedigree', 'Whiskas', 'Drools', 'Royal Canin'], variants: ['', 'Chicken', 'Adult', 'Puppy'], sizes: ['400g', '1kg', '3kg'], priceRange: [90, 1200], glutenFree: true, defaultPalmOil: false },
];

const QUALITY_TIERS: Array<'budget' | 'mid' | 'premium'> = ['budget', 'mid', 'premium'];

function generateProducts(target: number): CatalogProduct[] {
  const generated: CatalogProduct[] = [];
  let seed = 1000;

  outer: while (generated.length < target) {
    for (const tpl of CATEGORY_TEMPLATES) {
      for (const noun of tpl.nouns) {
        for (const brand of tpl.brands) {
          if (generated.length >= target) break outer;

          const variant = tpl.variants[seed % tpl.variants.length];
          const size = tpl.sizes[seed % tpl.sizes.length];
          const tier = QUALITY_TIERS[seed % QUALITY_TIERS.length];

          const namePieces = [brand, variant, noun, size].filter(Boolean);
          const name = namePieces.join(' ').replace(/\s+/g, ' ').trim();

          // Price scaled by tier within the category range
          const [min, max] = tpl.priceRange;
          const tierFactor = tier === 'budget' ? 0.15 : tier === 'mid' ? 0.5 : 0.85;
          const price = Math.round(min + (max - min) * tierFactor);

          const isOrganic = /organic/i.test(variant) || /organic/i.test(brand) || brand === '24 Mantra';
          const isLowSugar = /sugar-free|no added sugar|stevia/i.test(`${variant} ${noun}`) || tpl.category === 'spices' || tpl.category === 'dal';
          const containsPalmOil = tpl.defaultPalmOil && !/no palm oil|baked/i.test(variant);

          const dietaryLabels: string[] = ['vegetarian'];
          if (isOrganic) dietaryLabels.push('organic');
          if (tpl.glutenFree) dietaryLabels.push('gluten-free');
          if (isLowSugar) dietaryLabels.push('low-sugar');

          generated.push({
            productId: `gen-${tpl.category}-${seed}`,
            name,
            brand,
            category: tpl.category,
            price,
            labels: [noun.toLowerCase(), tier, ...(variant ? [variant.toLowerCase()] : [])],
            dietaryLabels,
            isOrganic,
            isLowSugar,
            isGlutenFree: tpl.glutenFree,
            containsPalmOil,
            qualityTier: tier,
            inStock: seed % 17 !== 0, // ~6% out of stock for realism
            imageUrl: imageFor(`${tpl.imageKeyword} ${noun}`, seed),
          });
          seed++;
        }
      }
    }
  }
  return generated;
}

// ─── Final Catalog Export (~500 SKUs) ────────────────────────────────────────

/** Curated products get real images too (keyed off their category). */
const curatedWithImages: CatalogProduct[] = curatedProducts.map((p, i) => ({
  ...p,
  imageUrl: p.imageUrl ?? imageFor(`${p.category} ${p.name}`, 1 + i),
}));

/** The full catalog: 50 curated + generated to reach ~500 SKUs. */
export const catalog: CatalogProduct[] = [
  ...curatedWithImages,
  ...generateProducts(450),
];
