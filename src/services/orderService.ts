import type { Order, OrderItem, PaymentMethod } from '../types';
import { dbGetOrders, dbSaveOrders } from './db';
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
  const nextNumber = orders.reduce((max, order) => {
    const match = order.code.match(/ORD-(\d+)/);
    const value = match ? Number(match[1]) : 0;
    return Math.max(max, value);
  }, 0) + 1;
  const now = new Date().toISOString();
  const order: Order = {
    ...data,
    id: uuid(),
    code: `ORD-${String(nextNumber).padStart(4, '0')}`,
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
