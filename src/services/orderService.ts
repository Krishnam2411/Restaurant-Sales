import type { Order, OrderItem, PaymentMethod } from '../types';
import { dbGetOrders, dbSaveOrders, dbGetSales } from './db';
import { v4 as uuid } from '../utils/uuid';

function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => (b.updatedAt + b.createdAt).localeCompare(a.updatedAt + a.createdAt));
}

export function calculateOrderTotal(items: OrderItem[], discount: number = 0): number {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  return Math.max(0, subtotal - (discount ?? 0));
}

export async function getOrders(): Promise<Order[]> {
  const orders = await dbGetOrders();
  return sortOrders(orders);
}

export async function addOrder(data: Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status'> & { status?: Order['status'] }): Promise<Order> {
  const orders = await dbGetOrders();

  // Collect all existing order codes from open/completed orders and sales to ensure uniqueness
  const existingCodes = new Set<string>();
  orders.forEach(o => { if (o.code) existingCodes.add(o.code.toUpperCase()); });

  try {
    const sales = await dbGetSales();
    sales.forEach(s => { if (s.orderCode) existingCodes.add(s.orderCode.toUpperCase()); });
  } catch (err) {
    console.warn('Failed to load sales for order code uniqueness check', err);
  }

  // Generate a unique 6-character alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let generatedCode = '';
  let attempts = 0;
  while (attempts < 1000) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existingCodes.has(code)) {
      generatedCode = code;
      break;
    }
    attempts++;
  }
  if (!generatedCode) {
    // Extreme fallback if somehow collision storm happens
    generatedCode = `ORD-${Date.now().toString().slice(-4)}`;
  }

  const now = new Date().toISOString();
  const order: Order = {
    ...data,
    id: uuid(),
    code: generatedCode,
    status: data.status ?? 'Open',
    createdAt: now,
    updatedAt: now,
  };
  await dbSaveOrders(sortOrders([...orders, order]));
  return order;
}

export async function updateOrder(id: string, updates: Partial<Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt'>>): Promise<Order> {
  const orders = await dbGetOrders();
  const idx = orders.findIndex(order => order.id === id);
  if (idx === -1) throw new Error('Order not found');
  const now = new Date().toISOString();
  orders[idx] = {
    ...orders[idx],
    ...updates,
    updatedAt: now,
  };
  await dbSaveOrders(sortOrders(orders));
  return orders[idx];
}

export async function completeOrder(id: string, payment: { method: PaymentMethod; cashAmount?: number; upiAmount?: number }): Promise<Order> {
  const orders = await dbGetOrders();
  const idx = orders.findIndex(order => order.id === id);
  if (idx === -1) throw new Error('Order not found');

  const now = new Date().toISOString();
  const total = calculateOrderTotal(orders[idx].items, orders[idx].discount ?? 0);
  orders[idx] = {
    ...orders[idx],
    status: 'Completed',
    paymentMethod: payment.method,
    cashAmount: payment.cashAmount,
    upiAmount: payment.upiAmount,
    completedAt: now,
    updatedAt: now,
  };

  const paid = (payment.cashAmount ?? 0) + (payment.upiAmount ?? 0);
  if (payment.method === 'Both' && Math.round(paid) !== Math.round(total)) {
    throw new Error('Split payment must match the order total');
  }

  await dbSaveOrders(sortOrders(orders));
  return orders[idx];
}

export async function deleteOrder(id: string): Promise<void> {
  const orders = await dbGetOrders();
  await dbSaveOrders(orders.filter(order => order.id !== id));
}
