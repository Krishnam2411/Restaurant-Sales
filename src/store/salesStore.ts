import { create } from 'zustand';
import type { Sale } from '../types';
import * as svc from '../services/salesService';
import { showToast } from '../components/shared/Toast';

interface SalesState {
  todaySales: Sale[];
  yesterdaySalesSum: number;
  ledgerSales: Sale[];
  analyticsSales: Sale[];

  loadToday: () => Promise<void>;
  loadYesterdaySum: () => Promise<void>;
  loadLedger: (date: string) => Promise<void>;
  loadAnalytics: (startDate: string, endDate: string) => Promise<void>;

  /** Write a new sale to DB, then reload slices. Used for manual sales entry. */
  add: (data: Omit<Sale, 'id' | 'createdAt'>) => Promise<Sale>;
  /** Ingest an already-persisted Sale into memory slices (no DB write). Used after atomic order completion. */
  ingest: (sale: Sale) => void;
  update: (id: string, updates: Partial<Omit<Sale, 'id' | 'createdAt'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  todaySales: [],
  yesterdaySalesSum: 0,
  ledgerSales: [],
  analyticsSales: [],

  loadToday: async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const sales = await svc.getSalesByDateRange(today, today);
      set({ todaySales: sales });
    } catch (err) {
      console.error('[SalesStore] loadToday failed', err);
      showToast("Failed to load today's sales", 'error');
    }
  },

  loadYesterdaySum: async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const sum = await svc.getSalesSumForDate(yesterdayStr);
      set({ yesterdaySalesSum: sum });
    } catch (err) {
      console.error('[SalesStore] loadYesterdaySum failed', err);
    }
  },

  loadLedger: async (date) => {
    try {
      const sales = await svc.getSalesByDateRange(date, date);
      set({ ledgerSales: sales });
    } catch (err) {
      console.error('[SalesStore] loadLedger failed', err);
      showToast('Failed to load ledger sales', 'error');
    }
  },

  loadAnalytics: async (startDate, endDate) => {
    try {
      const sales = await svc.getSalesByDateRange(startDate, endDate);
      set({ analyticsSales: sales });
    } catch (err) {
      console.error('[SalesStore] loadAnalytics failed', err);
      showToast('Failed to load analytics sales', 'error');
    }
  },

  add: async (data) => {
    try {
      const { sale } = await svc.addSale(data, []);
      // Reload today's sales and yesterday's sum
      await get().loadToday();
      await get().loadYesterdaySum();
      // Reload ledger if showing this date or empty
      const ledgerDate = sale.date;
      if (get().ledgerSales.some(s => s.date === ledgerDate) || get().ledgerSales.length === 0) {
        await get().loadLedger(ledgerDate);
      }
      return sale;
    } catch (err) {
      console.error('[SalesStore] add failed', err);
      showToast('Failed to add sale', 'error');
      throw err;
    }
  },

  ingest: (sale) => {
    // Sale is already persisted — just insert into in-memory slices
    const today = new Date().toISOString().slice(0, 10);
    const addToList = (list: Sale[]) =>
      [...list, sale].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    set(state => ({
      todaySales: sale.date === today ? addToList(state.todaySales) : state.todaySales,
      ledgerSales: state.ledgerSales.some(s => s.date === sale.date)
        ? addToList(state.ledgerSales)
        : state.ledgerSales,
      analyticsSales: state.analyticsSales.some(s => s.date === sale.date)
        ? addToList(state.analyticsSales)
        : state.analyticsSales,
      // Update running sum for today
      yesterdaySalesSum: state.yesterdaySalesSum, // unchanged
    }));
  },

  update: async (id, updates) => {
    const existing = get().todaySales.find(s => s.id === id) ||
                     get().ledgerSales.find(s => s.id === id) ||
                     get().analyticsSales.find(s => s.id === id);

    if (!existing) {
      showToast('Sale not found', 'error');
      return;
    }

    const updatedSale = { ...existing, ...updates };
    const updateInList = (list: Sale[]) => list.map(s => (s.id === id ? updatedSale : s));
    const prevToday = get().todaySales;
    const prevLedger = get().ledgerSales;
    const prevAnalytics = get().analyticsSales;

    // Optimistic
    set({
      todaySales: updateInList(prevToday),
      ledgerSales: updateInList(prevLedger),
      analyticsSales: updateInList(prevAnalytics),
    });

    try {
      await svc.updateSale(id, updates, [existing]);
      await get().loadToday();
      await get().loadYesterdaySum();
      if (prevLedger.length > 0) {
        const ledgerDate = prevLedger[0]?.date;
        if (ledgerDate) await get().loadLedger(ledgerDate);
      }
    } catch (err) {
      console.error('[SalesStore] update failed, reverting', err);
      set({
        todaySales: prevToday,
        ledgerSales: prevLedger,
        analyticsSales: prevAnalytics,
      });
      showToast('Failed to update sale — reverted', 'error');
    }
  },

  remove: async (id) => {
    const prevToday = get().todaySales;
    const prevLedger = get().ledgerSales;
    const prevAnalytics = get().analyticsSales;

    const existing = prevToday.find(s => s.id === id) ||
                     prevLedger.find(s => s.id === id) ||
                     prevAnalytics.find(s => s.id === id);

    if (!existing) {
      showToast('Sale not found', 'error');
      return;
    }

    // Optimistic
    set({
      todaySales: prevToday.filter(s => s.id !== id),
      ledgerSales: prevLedger.filter(s => s.id !== id),
      analyticsSales: prevAnalytics.filter(s => s.id !== id),
    });

    try {
      await svc.deleteSale(id, [existing]);
      await get().loadToday();
      await get().loadYesterdaySum();
      if (prevLedger.length > 0) {
        const ledgerDate = prevLedger[0]?.date;
        if (ledgerDate) await get().loadLedger(ledgerDate);
      }
    } catch (err) {
      console.error('[SalesStore] delete failed, reverting', err);
      set({
        todaySales: prevToday,
        ledgerSales: prevLedger,
        analyticsSales: prevAnalytics,
      });
      showToast('Failed to delete sale — reverted', 'error');
    }
  },
}));
