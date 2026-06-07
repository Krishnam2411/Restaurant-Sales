import type { Sale, DailyStat } from '../types';

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(date: string, time: string): string {
  return `${formatDate(date)} ${time}`;
}

export function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function last30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function groupByDate(sales: Sale[]): DailyStat[] {
  const map = new Map<string, DailyStat>();
  for (const s of sales) {
    const existing = map.get(s.date);
    if (existing) {
      existing.revenue += s.amount;
      existing.orders += 1;
    } else {
      map.set(s.date, { date: s.date, revenue: s.amount, orders: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function shortDayLabel(iso: string): string {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[new Date(iso + 'T00:00:00').getDay()];
}

export function shortDateLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
