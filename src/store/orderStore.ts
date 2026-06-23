import { create } from 'zustand';
import type { Order, PaymentMethod, Sale } from '../types';
import * as svc from '../services/orderService';
import { showToast } from '../components/shared/Toast';

interface OrderState {
  orders: Order[];
  /** Load all orders from DB (initial load only). */
  load: () => void;
  add: (data: Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status'> & { status?: Order['status'] }) => Promise<void>;
  update: (id: string, updates: Partial<Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  /**
   * Atomically completes an order + creates the sale in one DB transaction.
   * Returns the created Sale so the caller can update salesStore.
   */
  complete: (
    id: string,
    payment: { method: PaymentMethod; cashAmount?: number; upiAmount?: number },
    saleData: Omit<Sale, 'id' | 'createdAt'>
  ) => Promise<Sale>;
  remove: (id: string) => Promise<void>;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],

  load: () => {
    void (async () => {
      try {
        const orders = await svc.getActiveOrders();
        set({ orders });
      } catch (err) {
        console.error('[OrderStore] load failed', err);
        showToast('Failed to load active orders', 'error');
      }
    })();
  },

  add: async (data) => {
    const snapshot = get().orders;
    try {
      const { nextOrders } = await svc.addOrder(data, snapshot);
      set({ orders: nextOrders });
    } catch (err) {
      console.error('[OrderStore] add failed', err);
      set({ orders: snapshot });
      showToast('Failed to add order — reverted', 'error');
      throw err;
    }
  },

  update: async (id, updates) => {
    // Optimistic update first for instant UI response
    const snapshot = get().orders;
    const now = new Date().toISOString();
    const optimistic = snapshot.map(o =>
      o.id === id ? { ...o, ...updates, updatedAt: now } : o
    );
    set({ orders: optimistic });

    try {
      const { nextOrders } = await svc.updateOrder(id, updates, snapshot);
      set({ orders: nextOrders });
    } catch (err) {
      console.error('[OrderStore] update failed, reverting', err);
      set({ orders: snapshot });
      showToast('Failed to update order — reverted', 'error');
      throw err;
    }
  },

  complete: async (id, payment, saleData) => {
    const snapshot = get().orders;
    // Optimistic: immediately remove from live board (store only holds Open orders)
    set({ orders: snapshot.filter(o => o.id !== id) });
    try {
      // One atomic DB transaction: order completion + sale insertion
      const { sale } = await svc.completeOrder(id, payment, saleData, snapshot);
      return sale;
    } catch (err) {
      console.error('[OrderStore] complete failed', err);
      set({ orders: snapshot });
      showToast(err instanceof Error ? err.message : 'Failed to complete order', 'error');
      throw err;
    }
  },

  remove: async (id) => {
    const snapshot = get().orders;
    // Optimistic remove
    set({ orders: snapshot.filter(o => o.id !== id) });
    try {
      await svc.deleteOrder(id, snapshot);
    } catch (err) {
      console.error('[OrderStore] delete failed, reverting', err);
      set({ orders: snapshot });
      showToast('Failed to delete order — reverted', 'error');
      throw err;
    }
  },
}));