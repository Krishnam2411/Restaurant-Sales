import type { Sale } from '../types';
import { dbGetSales, dbInsertSale, dbUpdateSale, dbDeleteSale, dbGetSalesForRange, dbGetSalesSumForDate } from './db';
import { v4 as uuid } from '../utils/uuid';

function sortSales(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) => {
    const da = a.date + 'T' + a.time;
    const db2 = b.date + 'T' + b.time;
    return db2.localeCompare(da); // newest first
  });
}

/** Full-table read — only used on initial load. */
export async function getSales(): Promise<Sale[]> {
  const sales = await dbGetSales();
  return sortSales(sales);
}

/**
 * Add a new sale.
 * @param data         Sale data (without id/createdAt).
 * @param currentSales Current in-memory sales from the store.
 * @returns            { sale, nextSales }
 */
export async function addSale(
  data: Omit<Sale, 'id' | 'createdAt'>,
  currentSales: Sale[]
): Promise<{ sale: Sale; nextSales: Sale[] }> {
  const sale: Sale = { ...data, id: uuid(), createdAt: new Date().toISOString() };
  await dbInsertSale(sale);
  const nextSales = sortSales([...currentSales, sale]);
  return { sale, nextSales };
}

/**
 * Update a single sale by id.
 * @param id           Sale id.
 * @param updates      Partial fields to apply.
 * @param currentSales Current in-memory sales from the store.
 * @returns            { sale, nextSales }
 */
export async function updateSale(
  id: string,
  updates: Partial<Omit<Sale, 'id' | 'createdAt'>>,
  currentSales: Sale[]
): Promise<{ sale: Sale; nextSales: Sale[] }> {
  const idx = currentSales.findIndex(s => s.id === id);
  if (idx === -1) throw new Error('Sale not found');
  const sale: Sale = { ...currentSales[idx], ...updates };
  await dbUpdateSale(id, sale);
  const nextSales = sortSales(currentSales.map((s, i) => (i === idx ? sale : s)));
  return { sale, nextSales };
}

/**
 * Delete a single sale by id.
 * @returns nextSales — filtered array for the store.
 */
export async function deleteSale(id: string, currentSales: Sale[]): Promise<Sale[]> {
  await dbDeleteSale(id);
  return currentSales.filter(s => s.id !== id);
}

export async function getSalesByDateRange(from: string, to: string): Promise<Sale[]> {
  const sales = await dbGetSalesForRange(from, to);
  return sortSales(sales);
}

export async function getSalesSumForDate(date: string): Promise<number> {
  return dbGetSalesSumForDate(date);
}
