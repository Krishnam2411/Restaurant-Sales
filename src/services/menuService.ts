import type { MenuItem } from '../types';
import { dbGetMenuCategories, dbGetMenuItems, dbSaveMenuCategories, dbSaveMenuItems } from './db';
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

export async function addMenuItem(data: Omit<MenuItem, 'id' | 'createdAt' | 'isActive'> & { isActive?: boolean }): Promise<MenuItem> {
  const [items, categories] = await Promise.all([dbGetMenuItems(), dbGetMenuCategories()]);
  if (!categories.includes(data.category)) {
    await dbSaveMenuCategories([...categories, data.category]);
  }
  const item: MenuItem = { ...data, id: uuid(), createdAt: new Date().toISOString(), isActive: data.isActive ?? true };
  await dbSaveMenuItems([...items, item]);
  return item;
}

export async function updateMenuItem(id: string, updates: Partial<Omit<MenuItem, 'id' | 'createdAt'>>): Promise<MenuItem> {
  const [items, categories] = await Promise.all([dbGetMenuItems(), dbGetMenuCategories()]);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) throw new Error('Item not found');
  items[idx] = { ...items[idx], ...updates };
  if (updates.category && !categories.includes(updates.category)) {
    await dbSaveMenuCategories([...categories, updates.category]);
  }
  await dbSaveMenuItems(items);
  return items[idx];
}

export async function deleteMenuItem(id: string): Promise<void> {
  const items = await dbGetMenuItems();
  await dbSaveMenuItems(items.filter(i => i.id !== id));
}

export async function addMenuCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return dbGetMenuCategories();
  const categories = await dbGetMenuCategories();
  const exists = categories.some(cat => cat.toLowerCase() === trimmed.toLowerCase());
  if (exists) return categories;
  const next = [...categories, trimmed];
  await dbSaveMenuCategories(next);
  return next;
}

export async function renameCategory(oldName: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  const [items, categories] = await Promise.all([dbGetMenuItems(), dbGetMenuCategories()]);
  const conflict = categories.some(cat => cat.toLowerCase() === trimmed.toLowerCase() && cat !== oldName);
  if (conflict) throw new Error('A category with that name already exists');
  const nextCategories = categories.map(cat => (cat === oldName ? trimmed : cat));
  const nextItems = items.map(item => (item.category === oldName ? { ...item, category: trimmed } : item));
  await dbSaveMenuCategories(nextCategories);
  await dbSaveMenuItems(nextItems);
}

export async function removeCategory(name: string): Promise<void> {
  const [items, categories] = await Promise.all([dbGetMenuItems(), dbGetMenuCategories()]);
  await dbSaveMenuCategories(categories.filter(cat => cat !== name));
  await dbSaveMenuItems(items.filter(item => item.category !== name));
}
