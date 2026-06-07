// Updated types for cash/UPI payments
export type PaymentMethod = 'Cash' | 'UPI' | 'Both' | 'Unpaid' | 'Split';

export type OrderType = 'Dine' | 'Takeaway' | 'Local Delivery' | 'Zomato' | 'Swiggy';
export type OrderStatus = 'Open' | 'Completed' | 'Cancelled';

export type MenuCategory = string;

export interface MenuItem {
  id: string;
  name: string;
  localizedNameHi?: string;
  price: number;
  category: MenuCategory;
  description?: string;
  image?: string;
  isNonProfit?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface SaleItem {
  menuItemId?: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface OrderItem extends SaleItem {
  countsInSales: boolean;
  kotPrintedQty?: number;
}

export interface Order {
  id: string;
  code: string;
  type: OrderType;
  customerName?: string;
  items: OrderItem[];
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  cashAmount?: number;
  upiAmount?: number;
  discount?: number; // absolute amount to subtract from subtotal
  note?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Sale {
  id: string;
  orderCode?: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  channel?: OrderType;
  items: SaleItem[];
  freeText?: string;
  subtotal?: number; // before tax
  discount?: number; // absolute amount to subtract from subtotal
  taxRateApplied?: number; // percentage
  taxAmount?: number;
  amount: number; // total amount (after discount + tax)
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  upiAmount?: number;
  note?: string;
  createdAt: string;
}

export interface DailyStat {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

export interface PaymentSplit {
  method: PaymentMethod;
  count: number;
  total: number;
}
