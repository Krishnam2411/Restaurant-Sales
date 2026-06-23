import type { Order, OrderItem, PaymentMethod, Sale } from '../types';
import { dbGetOrders, dbInsertOrder, dbUpdateOrder, dbDeleteOrder, dbGetActiveOrders, dbCompleteOrderAndAddSale } from './db';
import { v4 as uuid } from '../utils/uuid';

function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => (b.updatedAt + b.createdAt).localeCompare(a.updatedAt + a.createdAt));
}

export function calculateOrderTotal(items: OrderItem[], discount: number = 0): number {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  return Math.max(0, subtotal - (discount ?? 0));
}

/** Full-table read — only used on initial load. */
export async function getOrders(): Promise<Order[]> {
  const orders = await dbGetOrders();
  return sortOrders(orders);
}

/** Fetch only active orders (Open status). */
export async function getActiveOrders(): Promise<Order[]> {
  const orders = await dbGetActiveOrders();
  return sortOrders(orders);
}

/**
 * Add a new order.
 * @param data          Order data (without id/code/timestamps).
 * @param currentOrders Current in-memory orders from the store (avoids a DB read).
 * @returns             { order, nextOrders } — the new order + updated sorted array.
 */
export async function addOrder(
  data: Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status'> & { status?: Order['status'] },
  currentOrders: Order[]
): Promise<{ order: Order; nextOrders: Order[] }> {
  // Collect existing codes from in-memory orders only (codes are session-scoped identifiers)
  const existingCodes = new Set<string>();
  currentOrders.forEach(o => { if (o.code) existingCodes.add(o.code.toUpperCase()); });

  // Generate a unique 6-character alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let generatedCode = '';
  let attempts = 0;
  while (attempts < 1000) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existingCodes.has(code)) { generatedCode = code; break; }
    attempts++;
  }
  if (!generatedCode) generatedCode = `ORD-${Date.now().toString().slice(-4)}`;

  const now = new Date().toISOString();
  const order: Order = {
    ...data,
    id: uuid(),
    code: generatedCode,
    status: data.status ?? 'Open',
    createdAt: now,
    updatedAt: now,
  };

  // Single targeted INSERT — no full-table write
  await dbInsertOrder(order);

  const nextOrders = sortOrders([...currentOrders, order]);
  return { order, nextOrders };
}

/**
 * Update a single order.
 * @param id            Order id to update.
 * @param updates       Partial fields to apply.
 * @param currentOrders Current in-memory orders from the store.
 * @returns             { order, nextOrders }
 */
export async function updateOrder(
  id: string,
  updates: Partial<Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt'>>,
  currentOrders: Order[]
): Promise<{ order: Order; nextOrders: Order[] }> {
  const idx = currentOrders.findIndex(o => o.id === id);
  if (idx === -1) throw new Error('Order not found');

  const now = new Date().toISOString();
  const order: Order = { ...currentOrders[idx], ...updates, updatedAt: now };

  await dbUpdateOrder(id, order);

  const nextOrders = sortOrders(currentOrders.map((o, i) => (i === idx ? order : o)));
  return { order, nextOrders };
}

/**
 * Atomically complete an order AND create the corresponding sale record.
 * Both writes go into a single SQLite transaction — if either fails, both
 * roll back, so the DB stays consistent.
 *
 * @param id            Order id to complete.
 * @param payment       Payment method + split amounts.
 * @param saleData      Pre-built sale data (items, amount, channel, etc.).
 * @param currentOrders Current in-memory orders from the store.
 * @returns             { order, sale } so stores can update without re-fetch.
 */
export async function completeOrder(
  id: string,
  payment: { method: PaymentMethod; cashAmount?: number; upiAmount?: number },
  saleData: Omit<Sale, 'id' | 'createdAt'>,
  currentOrders: Order[]
): Promise<{ order: Order; sale: Sale }> {
  const idx = currentOrders.findIndex(o => o.id === id);
  if (idx === -1) throw new Error('Order not found');

  const now = new Date().toISOString();
  const total = calculateOrderTotal(currentOrders[idx].items, currentOrders[idx].discount ?? 0);

  const paid = (payment.cashAmount ?? 0) + (payment.upiAmount ?? 0);
  if (payment.method === 'Both' && Math.round(paid) !== Math.round(total)) {
    throw new Error('Split payment must match the order total');
  }

  const order: Order = {
    ...currentOrders[idx],
    status: 'Completed',
    paymentMethod: payment.method,
    cashAmount: payment.cashAmount,
    upiAmount: payment.upiAmount,
    completedAt: now,
    updatedAt: now,
  };

  const sale: Sale = { ...saleData, id: uuid(), createdAt: now };

  // One atomic transaction: order completion + sale creation
  await dbCompleteOrderAndAddSale(order, sale);

  return { order, sale };
}

/**
 * Delete a single order.
 * @returns nextOrders — filtered array for the store.
 */
export async function deleteOrder(id: string, currentOrders: Order[]): Promise<Order[]> {
  await dbDeleteOrder(id);
  return currentOrders.filter(o => o.id !== id);
}
