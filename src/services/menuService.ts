import type { Addon, MenuItem } from '../types';
import {
  dbGetMenuCategories, dbGetMenuItems, dbSaveMenuCategories,
  dbInsertMenuItem, dbUpdateMenuItem, dbDeleteMenuItem,
  dbUpsertMenuCategory, dbDeleteMenuCategory,
} from './db';
import { v4 as uuid } from '../utils/uuid';

function sortMenuItems(items: MenuItem[], categories: string[]): MenuItem[] {
  const order = new Map(categories.map((cat, idx) => [cat, idx]));
  return [...items].sort((a, b) => {
    const aOrder = order.has(a.category) ? order.get(a.category)! : Number.MAX_SAFE_INTEGER;
    const bOrder = order.has(b.category) ? order.get(b.category)! : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const catCmp = a.category.localeCompare(b.category);
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
  });
}

/** Full-table read — only used on initial load. */
export async function getMenuItems(): Promise<MenuItem[]> {
  const [items, categories] = await Promise.all([dbGetMenuItems(), dbGetMenuCategories()]);
  return sortMenuItems(items, categories);
}

export async function getMenuCategories(): Promise<string[]> {
  return dbGetMenuCategories();
}

export async function getMenuData(): Promise<{ items: MenuItem[]; categories: string[] }> {
  const [items, categories] = await Promise.all([dbGetMenuItems(), dbGetMenuCategories()]);
  return { items: sortMenuItems(items, categories), categories };
}

/**
 * Add a menu item.
 * @param data          Item data (without id/createdAt/isActive).
 * @param currentItems  Current in-memory items from the store.
 * @param currentCats   Current in-memory categories from the store.
 * @returns             { item, nextItems, nextCategories }
 */
export async function addMenuItem(
  data: Omit<MenuItem, 'id' | 'createdAt' | 'isActive'> & { isActive?: boolean },
  currentItems: MenuItem[],
  currentCats: string[]
): Promise<{ item: MenuItem; nextItems: MenuItem[]; nextCategories: string[] }> {
  let nextCategories = currentCats;

  // If category is new, upsert it (targeted write, no full DELETE)
  if (!currentCats.includes(data.category)) {
    await dbUpsertMenuCategory(data.category, currentCats.length);
    nextCategories = [...currentCats, data.category];
  }

  const item: MenuItem = {
    ...data,
    id: uuid(),
    createdAt: new Date().toISOString(),
    isActive: data.isActive ?? true,
  };
  await dbInsertMenuItem(item);

  const nextItems = sortMenuItems([...currentItems, item], nextCategories);
  return { item, nextItems, nextCategories };
}

/**
 * Update a menu item.
 * @param id            Item id.
 * @param updates       Partial fields to apply.
 * @param currentItems  Current in-memory items from the store.
 * @param currentCats   Current in-memory categories from the store.
 * @returns             { item, nextItems, nextCategories }
 */
export async function updateMenuItem(
  id: string,
  updates: Partial<Omit<MenuItem, 'id' | 'createdAt'>>,
  currentItems: MenuItem[],
  currentCats: string[]
): Promise<{ item: MenuItem; nextItems: MenuItem[]; nextCategories: string[] }> {
  const idx = currentItems.findIndex(i => i.id === id);
  if (idx === -1) throw new Error('Item not found');

  const item: MenuItem = { ...currentItems[idx], ...updates };
  let nextCategories = currentCats;

  // If category changed to a new one, upsert it
  if (updates.category && !currentCats.includes(updates.category)) {
    await dbUpsertMenuCategory(updates.category, currentCats.length);
    nextCategories = [...currentCats, updates.category];
  }

  await dbUpdateMenuItem(id, item);

  const nextItems = sortMenuItems(currentItems.map((it, i) => (i === idx ? item : it)), nextCategories);
  return { item, nextItems, nextCategories };
}

/**
 * Delete a menu item.
 * @returns { nextItems }
 */
export async function deleteMenuItem(
  id: string,
  currentItems: MenuItem[]
): Promise<{ nextItems: MenuItem[] }> {
  await dbDeleteMenuItem(id);
  return { nextItems: currentItems.filter(i => i.id !== id) };
}

/**
 * Add a category (targeted INSERT OR REPLACE, no full DELETE).
 */
export async function addMenuCategory(
  name: string,
  currentCats: string[]
): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return currentCats;
  const exists = currentCats.some(c => c.toLowerCase() === trimmed.toLowerCase());
  if (exists) return currentCats;
  await dbUpsertMenuCategory(trimmed, currentCats.length);
  return [...currentCats, trimmed];
}

/**
 * Rename a category — touches all items in that category.
 * Still requires full-table writes for items + categories (infrequent, acceptable).
 */
export async function renameCategory(
  oldName: string,
  newName: string,
  currentItems: MenuItem[],
  currentCats: string[]
): Promise<{ nextItems: MenuItem[]; nextCategories: string[] }> {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return { nextItems: currentItems, nextCategories: currentCats };
  const conflict = currentCats.some(c => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName);
  if (conflict) throw new Error('A category with that name already exists');

  const nextCategories = currentCats.map(c => (c === oldName ? trimmed : c));
  const nextItems = currentItems.map(item => (item.category === oldName ? { ...item, category: trimmed } : item));

  // Rename requires bulk update — use existing full-save helpers (infrequent)
  await dbSaveMenuCategories(nextCategories);
  for (const item of nextItems) {
    if (item.category === trimmed && currentItems.find(i => i.id === item.id)?.category === oldName) {
      await dbUpdateMenuItem(item.id, item);
    }
  }

  return { nextItems, nextCategories };
}

/**
 * Remove a category and all its items.
 */
export async function removeCategory(
  name: string,
  currentItems: MenuItem[],
  currentCats: string[]
): Promise<{ nextItems: MenuItem[]; nextCategories: string[] }> {
  // Delete items in this category
  const toDelete = currentItems.filter(i => i.category === name);
  for (const item of toDelete) {
    await dbDeleteMenuItem(item.id);
  }
  await dbDeleteMenuCategory(name);

  return {
    nextItems: currentItems.filter(i => i.category !== name),
    nextCategories: currentCats.filter(c => c !== name),
  };
}

// ── Add-on helpers ──────────────────────────────────────

export async function addAddonToItem(
  itemId: string,
  data: Omit<Addon, 'id'>,
  currentItems: MenuItem[]
): Promise<{ nextItems: MenuItem[] }> {
  const idx = currentItems.findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error('Item not found');
  const newAddon: Addon = { ...data, id: uuid() };
  const item = { ...currentItems[idx], addons: [...(currentItems[idx].addons ?? []), newAddon] };
  await dbUpdateMenuItem(itemId, item);
  return { nextItems: currentItems.map((it, i) => (i === idx ? item : it)) };
}

export async function updateAddonOnItem(
  itemId: string,
  addonId: string,
  data: Partial<Omit<Addon, 'id'>>,
  currentItems: MenuItem[]
): Promise<{ nextItems: MenuItem[] }> {
  const idx = currentItems.findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error('Item not found');
  const addons = (currentItems[idx].addons ?? []).map(a => (a.id === addonId ? { ...a, ...data } : a));
  const item = { ...currentItems[idx], addons };
  await dbUpdateMenuItem(itemId, item);
  return { nextItems: currentItems.map((it, i) => (i === idx ? item : it)) };
}

export async function removeAddonFromItem(
  itemId: string,
  addonId: string,
  currentItems: MenuItem[]
): Promise<{ nextItems: MenuItem[] }> {
  const idx = currentItems.findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error('Item not found');
  const item = { ...currentItems[idx], addons: (currentItems[idx].addons ?? []).filter(a => a.id !== addonId) };
  await dbUpdateMenuItem(itemId, item);
  return { nextItems: currentItems.map((it, i) => (i === idx ? item : it)) };
}
