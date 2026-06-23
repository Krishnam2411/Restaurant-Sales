import { create } from 'zustand';
import type { Addon, MenuItem } from '../types';
import * as svc from '../services/menuService';
import { showToast } from '../components/shared/Toast';

interface MenuState {
  items: MenuItem[];
  categories: string[];
  /** Load all menu data from DB (initial load only). */
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

export const useMenuStore = create<MenuState>((set, get) => ({
  items: [],
  categories: [],

  load: () => {
    void (async () => {
      try {
        const data = await svc.getMenuData();
        set({ items: data.items, categories: data.categories });
      } catch (err) {
        console.error('[MenuStore] load failed', err);
        showToast('Failed to load menu', 'error');
      }
    })();
  },

  add: (data) => {
    const { items: snapshot, categories: catSnapshot } = get();
    void (async () => {
      try {
        const { nextItems, nextCategories } = await svc.addMenuItem(data, snapshot, catSnapshot);
        set({ items: nextItems, categories: nextCategories });
      } catch (err) {
        console.error('[MenuStore] add failed', err);
        set({ items: snapshot, categories: catSnapshot });
        showToast('Failed to add menu item — reverted', 'error');
      }
    })();
  },

  update: (id, updates) => {
    const { items: snapshot, categories: catSnapshot } = get();
    // Optimistic
    const optimistic = snapshot.map(it => (it.id === id ? { ...it, ...updates } : it));
    set({ items: optimistic });

    void (async () => {
      try {
        const { nextItems, nextCategories } = await svc.updateMenuItem(id, updates, snapshot, catSnapshot);
        set({ items: nextItems, categories: nextCategories });
      } catch (err) {
        console.error('[MenuStore] update failed, reverting', err);
        set({ items: snapshot, categories: catSnapshot });
        showToast('Failed to update menu item — reverted', 'error');
      }
    })();
  },

  remove: (id) => {
    const { items: snapshot, categories: catSnapshot } = get();
    set({ items: snapshot.filter(it => it.id !== id) });

    void (async () => {
      try {
        await svc.deleteMenuItem(id, snapshot);
      } catch (err) {
        console.error('[MenuStore] delete failed, reverting', err);
        set({ items: snapshot, categories: catSnapshot });
        showToast('Failed to delete menu item — reverted', 'error');
      }
    })();
  },

  addCategory: (name) => {
    const { categories: snapshot, items } = get();
    void (async () => {
      try {
        const nextCategories = await svc.addMenuCategory(name, snapshot);
        set({ categories: nextCategories });
      } catch (err) {
        console.error('[MenuStore] addCategory failed', err);
        set({ categories: snapshot, items });
        showToast('Failed to add category — reverted', 'error');
      }
    })();
  },

  renameCategory: async (oldName, newName) => {
    const { items: snapshot, categories: catSnapshot } = get();
    try {
      const { nextItems, nextCategories } = await svc.renameCategory(oldName, newName, snapshot, catSnapshot);
      set({ items: nextItems, categories: nextCategories });
    } catch (err) {
      console.error('[MenuStore] renameCategory failed', err);
      set({ items: snapshot, categories: catSnapshot });
      throw err; // re-throw so App.tsx can show a toast
    }
  },

  removeCategory: (name) => {
    const { items: snapshot, categories: catSnapshot } = get();
    // Optimistic
    set({
      items: snapshot.filter(it => it.category !== name),
      categories: catSnapshot.filter(c => c !== name),
    });
    void (async () => {
      try {
        await svc.removeCategory(name, snapshot, catSnapshot);
      } catch (err) {
        console.error('[MenuStore] removeCategory failed, reverting', err);
        set({ items: snapshot, categories: catSnapshot });
        showToast('Failed to remove category — reverted', 'error');
      }
    })();
  },

  addAddon: (itemId, data) => {
    const { items: snapshot } = get();
    void (async () => {
      try {
        const { nextItems } = await svc.addAddonToItem(itemId, data, snapshot);
        set({ items: nextItems });
      } catch (err) {
        console.error('[MenuStore] addAddon failed', err);
        set({ items: snapshot });
        showToast('Failed to add add-on — reverted', 'error');
      }
    })();
  },

  updateAddon: (itemId, addonId, data) => {
    const { items: snapshot } = get();
    // Optimistic
    const optimistic = snapshot.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, addons: (it.addons ?? []).map(a => (a.id === addonId ? { ...a, ...data } : a)) };
    });
    set({ items: optimistic });

    void (async () => {
      try {
        const { nextItems } = await svc.updateAddonOnItem(itemId, addonId, data, snapshot);
        set({ items: nextItems });
      } catch (err) {
        console.error('[MenuStore] updateAddon failed, reverting', err);
        set({ items: snapshot });
        showToast('Failed to update add-on — reverted', 'error');
      }
    })();
  },

  removeAddon: (itemId, addonId) => {
    const { items: snapshot } = get();
    // Optimistic
    set({
      items: snapshot.map(it =>
        it.id !== itemId ? it : { ...it, addons: (it.addons ?? []).filter(a => a.id !== addonId) }
      ),
    });
    void (async () => {
      try {
        await svc.removeAddonFromItem(itemId, addonId, snapshot);
      } catch (err) {
        console.error('[MenuStore] removeAddon failed, reverting', err);
        set({ items: snapshot });
        showToast('Failed to remove add-on — reverted', 'error');
      }
    })();
  },
}));
