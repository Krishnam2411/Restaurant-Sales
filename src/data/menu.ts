export const MENU_CATEGORIES = [
  'Breakfast',
  'Dosa',
  'Rice Bowl',
  'Kulcha',
  'Thali',
  'Quick Bites',
  'Chaat',
  'Snacks',
  'Beverages',
  'Sweets',
] as const;

export type AalsiCategory = typeof MENU_CATEGORIES[number];
