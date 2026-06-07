import { create } from 'zustand';
import type { Sale } from '../types';
import * as svc from '../services/salesService';

interface SalesState {
  sales: Sale[];
  load: () => void;
  add: (data: Omit<Sale, 'id' | 'createdAt'>) => void;
  update: (id: string, updates: Partial<Omit<Sale, 'id' | 'createdAt'>>) => void;
  remove: (id: string) => void;
}

export const useSalesStore = create<SalesState>((set) => ({
  sales: [],
  load: () => {
    void (async () => {
      const sales = await svc.getSales();
      set({ sales });
    })();
  },
  add: (data) => {
    void (async () => {
      await svc.addSale(data);
      const sales = await svc.getSales();
      set({ sales });
    })();
  },
  update: (id, updates) => {
    void (async () => {
      await svc.updateSale(id, updates);
      const sales = await svc.getSales();
      set({ sales });
    })();
  },
  remove: (id) => {
    void (async () => {
      await svc.deleteSale(id);
      const sales = await svc.getSales();
      set({ sales });
    })();
  },
}));
