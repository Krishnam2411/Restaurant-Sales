import type { IconName } from '../shared/Icon';

export type TabKey = 'insights' | 'orders' | 'ledger' | 'analytics' | 'inventory' | 'updates' | 'settings';
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'updated' | 'error' | 'unsupported';

export type LedgerMenuState = {
  saleId: string | null;
  x: number;
  y: number;
} | null;

export type LedgerField = 'date' | 'time' | 'amount' | 'paymentMethod' | 'note' | 'items';

export type LedgerEditState = {
  saleId: string;
  field: LedgerField;
  value: string;
} | null;

export type LedgerDatePreset = 'Today' | 'Yesterday' | 'Custom';

export type AnalyticsRange = 'Today' | 'Yesterday' | 'This Week' | 'This Month';
export type AnalyticsScope = 'All' | 'Category' | 'Item';

export type TabConfig = {
  key: TabKey;
  label: string;
  icon: IconName;
};

export type AnalyticsData = {
  totalSales: number;
  totalOrders: number;
  topItems: Array<{ name: string; totalQty: number; totalRevenue: number }>;
  chartData: Array<{ label: string; revenue: number; orders: number }>;
  pieData: Array<{ name: string; value: number }>;
};