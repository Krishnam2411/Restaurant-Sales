import { useMemo } from 'react';
import type { Sale, TopItem, PaymentSplit, PaymentMethod } from '../types';
import { todayISO, startOfWeekISO, startOfMonthISO } from '../utils/dateUtils';

export function useSalesStats(sales: Sale[]) {
  return useMemo(() => {
    const today = todayISO();
    const weekStart = startOfWeekISO();
    const monthStart = startOfMonthISO();

    const activeSales = sales.filter(s => s.paymentMethod !== 'Cancelled');

    const todaySales = activeSales.filter(s => s.date === today);
    const weekSales = activeSales.filter(s => s.date >= weekStart);
    const monthSales = activeSales.filter(s => s.date >= monthStart);

    const sum = (arr: Sale[]) => arr.reduce((a, s) => a + s.amount, 0);

    // Top items by qty sold
    const itemMap = new Map<string, TopItem>();
    for (const sale of activeSales) {
      for (const item of sale.items) {
        const existing = itemMap.get(item.name);
        if (existing) {
          existing.totalQty += item.qty;
          existing.totalRevenue += item.qty * item.unitPrice;
        } else {
          itemMap.set(item.name, {
            name: item.name,
            totalQty: item.qty,
            totalRevenue: item.qty * item.unitPrice,
          });
        }
      }
    }
    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);

    // Payment split
    const payMap = new Map<PaymentMethod, PaymentSplit>();
    for (const s of activeSales) {
      const existing = payMap.get(s.paymentMethod);
      if (existing) {
        existing.count += 1;
        existing.total += s.amount;
      } else {
        payMap.set(s.paymentMethod, { method: s.paymentMethod, count: 1, total: s.amount });
      }
    }
    const paymentSplit = Array.from(payMap.values());

    // Best day
    const dayMap = new Map<string, number>();
    for (const s of activeSales) {
      dayMap.set(s.date, (dayMap.get(s.date) ?? 0) + s.amount);
    }
    const bestDayRevenue = Math.max(0, ...Array.from(dayMap.values()));

    return {
      todayRevenue: sum(todaySales),
      todayOrders: todaySales.length,
      weekRevenue: sum(weekSales),
      weekOrders: weekSales.length,
      monthRevenue: sum(monthSales),
      monthOrders: monthSales.length,
      totalRevenue: sum(activeSales),
      totalOrders: activeSales.length,
      avgOrderValue: activeSales.length ? sum(activeSales) / activeSales.length : 0,
      bestDayRevenue,
      topItems,
      paymentSplit,
    };
  }, [sales]);
}
