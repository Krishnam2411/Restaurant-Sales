import { useMemo } from 'react';
import type { Sale } from '../types';
import { last7Days, last30Days, shortDayLabel, shortDateLabel } from '../utils/dateUtils';

export function useWeeklyChartData(sales: Sale[]) {
  return useMemo(() => {
    const days = last7Days();
    return days.map(date => {
      const daySales = sales.filter(s => s.date === date);
      return {
        label: shortDayLabel(date),
        revenue: daySales.reduce((a, s) => a + s.amount, 0),
        orders: daySales.length,
      };
    });
  }, [sales]);
}

export function useMonthlyChartData(sales: Sale[]) {
  return useMemo(() => {
    const days = last30Days();
    return days.map(date => {
      const daySales = sales.filter(s => s.date === date);
      return {
        label: shortDateLabel(date),
        revenue: daySales.reduce((a, s) => a + s.amount, 0),
        orders: daySales.length,
      };
    });
  }, [sales]);
}
