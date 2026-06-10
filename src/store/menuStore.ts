import { create } from 'zustand';
import type { Addon, MenuItem } from '../types';
import * as svc from '../services/menuService';

interface MenuState {
  items: MenuItem[];
  categories: string[];
  load: () => void;
  add: (data: Omit<MenuItem, 'id' | 'createdAt' | 'isActive'> & { isActive?: boolean }) => void;
  update: (id: string, updates: Partial<Omit<MenuItem, 'id' | 'createdAt'>>) => void;
  remove: (id: string) => void;
  addCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => Promise<void>;
  removeCategory: (name: string) => void;
  addAddon: (itemId: string, data: Omit<Addon, 'id'>) => void;
  updateAddon: (itemId: string, addonId: string, data: Partial<Omit<Addon, 'id'>>) => void;
  removeAddon: (itemId: string, addonId: string) => void;
}


export const useMenuStore = create<MenuState>((set) => ({
  items: [],
  categories: [],
  load: () => {
    void (async () => {
      const data = await svc.getMenuData();
      set({ items: data.items, categories: data.categories });
    })();
  },
  add: (data) => {
    void (async () => {
      await svc.addMenuItem(data);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  update: (id, updates) => {
    void (async () => {
      await svc.updateMenuItem(id, updates);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  remove: (id) => {
    void (async () => {
      await svc.deleteMenuItem(id);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  addCategory: (name) => {
    void (async () => {
      await svc.addMenuCategory(name);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  renameCategory: async (oldName, newName) => {
    await svc.renameCategory(oldName, newName);
    const next = await svc.getMenuData();
    set({ items: next.items, categories: next.categories });
  },
  removeCategory: (name) => {
    void (async () => {
      await svc.removeCategory(name);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  addAddon: (itemId, data) => {
    void (async () => {
      await svc.addAddonToItem(itemId, data);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  updateAddon: (itemId, addonId, data) => {
    void (async () => {
      await svc.updateAddonOnItem(itemId, addonId, data);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
  removeAddon: (itemId, addonId) => {
    void (async () => {
      await svc.removeAddonFromItem(itemId, addonId);
      const next = await svc.getMenuData();
      set({ items: next.items, categories: next.categories });
    })();
  },
}));
