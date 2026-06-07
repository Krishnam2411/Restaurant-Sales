import type { Sale } from '../types';
import { dbGetSales, dbSaveSales } from './db';
import { v4 as uuid } from '../utils/uuid';

export async function getSales(): Promise<Sale[]> {
  const sales = await dbGetSales();
  return sales.sort((a, b) => {
    const da = a.date + 'T' + a.time;
    const db2 = b.date + 'T' + b.time;
    return db2.localeCompare(da); // newest first
  });
}

export async function addSale(data: Omit<Sale, 'id' | 'createdAt'>): Promise<Sale> {
  const sales = await dbGetSales();
  const newSale: Sale = { ...data, id: uuid(), createdAt: new Date().toISOString() };
  await dbSaveSales([...sales, newSale]);
  return newSale;
}

export async function updateSale(id: string, updates: Partial<Omit<Sale, 'id' | 'createdAt'>>): Promise<Sale> {
  const sales = await dbGetSales();
  const idx = sales.findIndex(s => s.id === id);
  if (idx === -1) throw new Error('Sale not found');
  sales[idx] = { ...sales[idx], ...updates };
  await dbSaveSales(sales);
  return sales[idx];
}

export async function deleteSale(id: string): Promise<void> {
  const sales = await dbGetSales();
  await dbSaveSales(sales.filter(s => s.id !== id));
}

export async function getSalesByDateRange(from: string, to: string): Promise<Sale[]> {
  const sales = await getSales();
  return sales.filter(s => s.date >= from && s.date <= to);
}
