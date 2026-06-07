import { create } from 'zustand';
import type { Order, PaymentMethod } from '../types';
import * as svc from '../services/orderService';

interface OrderState {
  orders: Order[];
  load: () => void;
  add: (data: Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status'> & { status?: Order['status'] }) => void;
  update: (id: string, updates: Partial<Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt'>>) => void;
  complete: (id: string, payment: { method: PaymentMethod; cashAmount?: number; upiAmount?: number }) => void;
  remove: (id: string) => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  load: () => {
    void (async () => {
      const orders = await svc.getOrders();
      set({ orders });
    })();
  },
  add: (data) => {
    void (async () => {
      await svc.addOrder(data);
      const orders = await svc.getOrders();
      set({ orders });
    })();
  },
  update: (id, updates) => {
    void (async () => {
      await svc.updateOrder(id, updates);
      const orders = await svc.getOrders();
      set({ orders });
    })();
  },
  complete: (id, payment) => {
    void (async () => {
      await svc.completeOrder(id, payment);
      const orders = await svc.getOrders();
      set({ orders });
    })();
  },
  remove: (id) => {
    void (async () => {
      await svc.deleteOrder(id);
      const orders = await svc.getOrders();
      set({ orders });
    })();
  },
}));