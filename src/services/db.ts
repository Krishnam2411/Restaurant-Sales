// Abstracted persistence layer.
// Uses SQLite via Tauri when available, otherwise falls back to localStorage.

import type { MenuItem, Order, OrderItem, Sale, SaleItem } from '../types';
import { v4 as uuid } from '../utils/uuid';
import { isTauri } from '../utils/tauri';
import { appDataDir, join } from '@tauri-apps/api/path';

type SqliteClient = {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>;
  select: <T = Record<string, unknown>>(query: string, bindValues?: unknown[]) => Promise<T[]>;
};

const LEGACY_DEFAULT_MENU_CATEGORIES = [
  'Breakfast',
  'Dosa',
  'Rice Bowl',
  'Kulcha',
  'Thali',
  'Quick Bites',
  'Chaat',
  'Snacks',
  'Beverages',
  'Sweets',
  'Other',
];

let sqlite: SqliteClient | null = null;
let sqliteReady: Promise<void> | null = null;
let sqliteUrl: string | null = null;
const TESTING_MODE_KEY = 'restrosales__testingMode';
const ANALYTICS_EXPERIMENTAL_KEY = 'restrosales__analyticsExperimental';

function readPersistedTestingMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(TESTING_MODE_KEY) === 'true';
  } catch (err) {
    console.warn('Failed to read persisted testing mode', err);
    return false;
  }
}

function persistTestingMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TESTING_MODE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('Failed to persist testing mode', err);
  }
}

function readPersistedAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ANALYTICS_EXPERIMENTAL_KEY) === 'true';
  } catch (err) {
    console.warn('Failed to read persisted analytics flag', err);
    return false;
  }
}

function persistAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ANALYTICS_EXPERIMENTAL_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('Failed to persist analytics flag', err);
  }
}

let testingMode = readPersistedTestingMode();
let analyticsExperimental = readPersistedAnalyticsEnabled();

export function isTestingMode(): boolean {
  return testingMode;
}

export function isAnalyticsExperimentalEnabled(): boolean {
  return analyticsExperimental;
}

export async function clearCurrentDatabase(): Promise<void> {
  if (!isTauri()) {
    try {
      localStorage.removeItem('restrosales__sales');
    } catch (err) {
      console.warn('Failed to clear local storage database', err);
    }
    return;
  }

  await ensureSqlite();
  if (!sqlite) return;

  await sqlite.execute('DELETE FROM sale_items');
  await sqlite.execute('DELETE FROM sales');
  await sqlite.execute('DELETE FROM order_items');
  await sqlite.execute('DELETE FROM orders');
  await sqlite.execute('DELETE FROM menu_items');
  await sqlite.execute('DELETE FROM menu_categories');
}

async function resolveSqliteUrl(): Promise<string> {
  if (sqliteUrl) return sqliteUrl;
  const baseDir = await appDataDir();
  const dbFile = testingMode ? 'aalsi_chatore_test.db' : 'aalsi_chatore.db';
  const dbPath = await join(baseDir, dbFile);
  sqliteUrl = `sqlite:${dbPath}`;
  return sqliteUrl;
}

export async function setTestingMode(enabled: boolean): Promise<void> {
  testingMode = enabled;
  persistTestingMode(enabled);

  if (!isTauri()) {
    return;
  }

  // clear existing sqlite instances so next ensureSqlite uses the correct DB file
  sqlite = null;
  sqliteReady = null;
  sqliteUrl = null;
}

export async function setAnalyticsExperimentalEnabled(enabled: boolean): Promise<void> {
  analyticsExperimental = enabled;
  persistAnalyticsEnabled(enabled);
}

async function ensureSqlite(): Promise<void> {
  if (!isTauri()) return;
  if (sqlite) return;
  if (!sqliteReady) {
    sqliteReady = (async () => {
      const { default: Database } = await import('@tauri-apps/plugin-sql');
      const db = await Database.load(await resolveSqliteUrl());
      sqlite = db;
      await db.execute(
        `CREATE TABLE IF NOT EXISTS menu_items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          localized_name_hi TEXT,
          price REAL NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          image TEXT,
          is_non_profit INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          addons TEXT,
          created_at TEXT NOT NULL
        )`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS menu_categories (
          name TEXT PRIMARY KEY,
          sort_order INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          order_code TEXT,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          amount REAL NOT NULL,
          subtotal REAL NOT NULL DEFAULT 0,
          discount REAL NOT NULL DEFAULT 0,
          tax_rate REAL NOT NULL DEFAULT 0,
          tax_amount REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          payment_method TEXT NOT NULL,
          cash_amount REAL,
          upi_amount REAL,
          channel TEXT NOT NULL DEFAULT 'Takeaway',
          note TEXT,
          created_at TEXT NOT NULL
        )`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS sale_items (
          id TEXT PRIMARY KEY,
          sale_id TEXT NOT NULL,
          menu_item_id TEXT,
          name TEXT NOT NULL,
          qty INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          addons TEXT,
          FOREIGN KEY (sale_id) REFERENCES sales(id)
        )`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          order_type TEXT NOT NULL,
          customer_name TEXT,
          status TEXT NOT NULL,
          amount REAL NOT NULL,
          payment_method TEXT,
          cash_amount REAL,
          upi_amount REAL,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        )`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          menu_item_id TEXT,
          name TEXT NOT NULL,
          qty INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          counts_in_sales INTEGER NOT NULL DEFAULT 1,
          kot_printed_qty INTEGER NOT NULL DEFAULT 0,
          addons TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(id)
        )`
      );

      // Settings table (key-value)
      await db.execute(
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          last_updated TEXT NOT NULL
        )`
      );

      const menuCols: Array<{ name: string }> = await db.select('PRAGMA table_info(menu_items)');
      const hasLocalizedNameHi = menuCols.some(col => col.name === 'localized_name_hi');
      if (!hasLocalizedNameHi) {
        await db.execute('ALTER TABLE menu_items ADD COLUMN localized_name_hi TEXT');
      }
      const hasIsActive = menuCols.some(col => col.name === 'is_active');
      if (!hasIsActive) {
        await db.execute('ALTER TABLE menu_items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
      }
      const hasDescription = menuCols.some(col => col.name === 'description');
      if (!hasDescription) {
        await db.execute('ALTER TABLE menu_items ADD COLUMN description TEXT');
      }
      const hasImage = menuCols.some(col => col.name === 'image');
      if (!hasImage) {
        await db.execute('ALTER TABLE menu_items ADD COLUMN image TEXT');
      }
      const hasIsNonProfit = menuCols.some(col => col.name === 'is_non_profit');
      if (!hasIsNonProfit) {
        await db.execute('ALTER TABLE menu_items ADD COLUMN is_non_profit INTEGER NOT NULL DEFAULT 0');
      }
      for (const category of LEGACY_DEFAULT_MENU_CATEGORIES) {
        await db.execute(
          'DELETE FROM menu_categories WHERE name = ? AND NOT EXISTS (SELECT 1 FROM menu_items WHERE category = ?)',
          [category, category]
        );
      }
      // Ensure sales table has newer columns (for older DBs)
      const salesCols: Array<{ name: string }> = await db.select('PRAGMA table_info(sales)');
      const sCols = salesCols.map(c => c.name);
      if (!sCols.includes('order_code')) await db.execute('ALTER TABLE sales ADD COLUMN order_code TEXT');
      if (!sCols.includes('subtotal')) await db.execute('ALTER TABLE sales ADD COLUMN subtotal REAL NOT NULL DEFAULT 0');
      if (!sCols.includes('discount')) await db.execute('ALTER TABLE sales ADD COLUMN discount REAL NOT NULL DEFAULT 0');
      if (!sCols.includes('tax_rate')) await db.execute('ALTER TABLE sales ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0');
      if (!sCols.includes('tax_amount')) await db.execute('ALTER TABLE sales ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0');
      if (!sCols.includes('total_amount')) await db.execute('ALTER TABLE sales ADD COLUMN total_amount REAL NOT NULL DEFAULT 0');
      if (!sCols.includes('cash_amount')) await db.execute('ALTER TABLE sales ADD COLUMN cash_amount REAL');
      if (!sCols.includes('upi_amount')) await db.execute('ALTER TABLE sales ADD COLUMN upi_amount REAL');
      if (!sCols.includes('channel')) await db.execute("ALTER TABLE sales ADD COLUMN channel TEXT NOT NULL DEFAULT 'Takeaway'");
      if (!sCols.includes('extra_charges')) await db.execute('ALTER TABLE sales ADD COLUMN extra_charges TEXT');
      // Ensure orders table has newer columns (for older DBs)
      const orderCols: Array<{ name: string }> = await db.select('PRAGMA table_info(orders)');
      const oCols = orderCols.map(c => c.name);
      if (!oCols.includes('amount')) await db.execute('ALTER TABLE orders ADD COLUMN amount REAL NOT NULL DEFAULT 0');
      if (!oCols.includes('cash_amount')) await db.execute('ALTER TABLE orders ADD COLUMN cash_amount REAL');
      if (!oCols.includes('upi_amount')) await db.execute('ALTER TABLE orders ADD COLUMN upi_amount REAL');
      if (!oCols.includes('discount')) await db.execute('ALTER TABLE orders ADD COLUMN discount REAL NOT NULL DEFAULT 0');
      if (!oCols.includes('extra_charges')) await db.execute('ALTER TABLE orders ADD COLUMN extra_charges TEXT');
      // Ensure order_items table has kot_printed_qty column for KOT tracking
      const orderItemsCols: Array<{ name: string }> = await db.select('PRAGMA table_info(order_items)');
      const oiCols = orderItemsCols.map(c => c.name);
      if (!oiCols.includes('kot_printed_qty')) {
        try {
          await db.execute('ALTER TABLE order_items ADD COLUMN kot_printed_qty INTEGER NOT NULL DEFAULT 0');
        } catch (err) {
          try { await db.execute('ALTER TABLE order_items ADD COLUMN kot_printed_qty INTEGER'); } catch (e) { /* ignore */ }
        }
      }
      if (!oiCols.includes('addons')) {
        await db.execute('ALTER TABLE order_items ADD COLUMN addons TEXT');
      }
      // Ensure menu_items has addons column
      if (!menuCols.some(col => col.name === 'addons')) {
        await db.execute('ALTER TABLE menu_items ADD COLUMN addons TEXT');
      }
      // Ensure sale_items has addons column
      const saleItemsCols: Array<{ name: string }> = await db.select('PRAGMA table_info(sale_items)');
      if (!saleItemsCols.some(col => col.name === 'addons')) {
        await db.execute('ALTER TABLE sale_items ADD COLUMN addons TEXT');
      }
    })();
  }
  await sqliteReady;
}

// ── Sales ──────────────────────────────────────────────
export async function dbGetSales(): Promise<Sale[]> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return [];

  const salesRows = await sqlite.select<{
    id: string;
    order_code?: string | null;
    date: string;
    time: string;
    subtotal?: number;
    discount?: number;
    tax_rate?: number;
    tax_amount?: number;
    total_amount?: number;
    amount: number;
    payment_method: string;
    cash_amount?: number | null;
    upi_amount?: number | null;
    channel?: string | null;
    note: string | null;
    created_at: string;
    extra_charges?: string | null;
  }>('SELECT * FROM sales ORDER BY date DESC, time DESC');

  const itemRows = await sqlite.select<{
    id: string;
    sale_id: string;
    menu_item_id: string | null;
    name: string;
    qty: number;
    unit_price: number;
    addons: string | null;
  }>('SELECT * FROM sale_items');

  const itemsBySale = new Map<string, SaleItem[]>();
  itemRows.forEach(row => {
    const items = itemsBySale.get(row.sale_id) ?? [];
    items.push({
      menuItemId: row.menu_item_id ?? undefined,
      name: row.name,
      qty: Number(row.qty),
      unitPrice: Number(row.unit_price),
      addons: row.addons ? JSON.parse(row.addons) : undefined,
    });
    itemsBySale.set(row.sale_id, items);
  });

  return salesRows.map(row => ({
    id: row.id,
    orderCode: row.order_code ?? undefined,
    date: row.date,
    time: row.time,
    items: itemsBySale.get(row.id) ?? [],
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    taxRateApplied: Number(row.tax_rate ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    amount: Number(row.total_amount ?? row.amount),
    paymentMethod: row.payment_method as Sale['paymentMethod'],
    cashAmount: row.cash_amount == null ? undefined : Number(row.cash_amount),
    upiAmount: row.upi_amount == null ? undefined : Number(row.upi_amount),
    channel: (row.channel ?? undefined) as any,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    extraCharges: row.extra_charges ? JSON.parse(row.extra_charges) : undefined,
  }));
}

export async function dbSaveSales(sales: Sale[]): Promise<void> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return;

  await sqlite.execute('DELETE FROM sale_items');
  await sqlite.execute('DELETE FROM sales');

  for (const sale of sales) {
    const subtotal = sale.subtotal ?? sale.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const discount = sale.discount ?? 0;
    const discountedSubtotal = Math.max(0, subtotal - discount);
    const taxRate = sale.taxRateApplied ?? 0;
    const taxAmount = sale.taxAmount ?? +(discountedSubtotal * (taxRate / 100));
    const totalAmount = sale.amount ?? +(discountedSubtotal + taxAmount);
    await sqlite.execute(
      'INSERT INTO sales (id, order_code, date, time, subtotal, discount, tax_rate, tax_amount, total_amount, amount, payment_method, cash_amount, upi_amount, channel, note, created_at, extra_charges) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        sale.id,
        sale.orderCode ?? null,
        sale.date,
        sale.time,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        totalAmount,
        totalAmount,
        sale.paymentMethod,
        sale.cashAmount ?? null,
        sale.upiAmount ?? null,
        sale.channel ?? 'Takeaway',
        sale.note ?? null,
        sale.createdAt,
        sale.extraCharges ? JSON.stringify(sale.extraCharges) : null
      ]
    );

    for (const item of sale.items) {
      await sqlite.execute(
        'INSERT INTO sale_items (id, sale_id, menu_item_id, name, qty, unit_price, addons) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), sale.id, item.menuItemId ?? null, item.name, item.qty, item.unitPrice, item.addons ? JSON.stringify(item.addons) : null]
      );
    }
  }
}

// Settings helpers
export async function getSetting(key: string): Promise<string | null> {
  if (!isTauri()) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }
  await ensureSqlite();
  if (!sqlite) return null;
  const rows = await sqlite.select<{ key: string; value: string; last_updated: string }>('SELECT key, value, last_updated FROM settings WHERE key = ?', [key]);
  if (!rows || rows.length === 0) return null;
  return rows[0].value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (!isTauri()) {
    try { localStorage.setItem(key, value); return; } catch (err) { console.warn('Failed to persist setting', err); return; }
  }
  await ensureSqlite();
  if (!sqlite) return;
  await sqlite.execute('INSERT OR REPLACE INTO settings (key, value, last_updated) VALUES (?, ?, ?)', [key, value, new Date().toISOString()]);
}

// ── Orders ─────────────────────────────────────────────
export async function dbGetOrders(): Promise<Order[]> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return [];

  const orderRows = await sqlite.select<{
    id: string;
    code: string;
    order_type: string;
    customer_name: string | null;
    status: string;
    amount: number;
    discount?: number | null;
    payment_method: string | null;
    cash_amount: number | null;
    upi_amount: number | null;
    note: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    extra_charges?: string | null;
  }>('SELECT * FROM orders ORDER BY updated_at DESC, created_at DESC');

  const itemRows = await sqlite.select<{
    id: string;
    order_id: string;
    menu_item_id: string | null;
    name: string;
    qty: number;
    unit_price: number;
    counts_in_sales: number;
    kot_printed_qty?: number | null;
    addons: string | null;
  }>('SELECT * FROM order_items');

  const itemsByOrder = new Map<string, OrderItem[]>();
  itemRows.forEach(row => {
    const items = itemsByOrder.get(row.order_id) ?? [];
    items.push({
      menuItemId: row.menu_item_id ?? undefined,
      name: row.name,
      qty: Number(row.qty),
      unitPrice: Number(row.unit_price),
      countsInSales: Number(row.counts_in_sales) !== 0,
      kotPrintedQty: row.kot_printed_qty == null ? undefined : Number(row.kot_printed_qty),
      addons: row.addons ? JSON.parse(row.addons) : undefined,
    });
    itemsByOrder.set(row.order_id, items);
  });

  return orderRows.map(row => ({
    id: row.id,
    code: row.code,
    type: row.order_type as Order['type'],
    customerName: row.customer_name ?? undefined,
    items: itemsByOrder.get(row.id) ?? [],
    status: row.status as Order['status'],
    paymentMethod: row.payment_method ? (row.payment_method as Order['paymentMethod']) : undefined,
    cashAmount: row.cash_amount == null ? undefined : Number(row.cash_amount),
    upiAmount: row.upi_amount == null ? undefined : Number(row.upi_amount),
    discount: row.discount == null ? undefined : Number(row.discount),
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    extraCharges: row.extra_charges ? JSON.parse(row.extra_charges) : undefined,
  }));
}

export async function dbSaveOrders(orders: Order[]): Promise<void> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return;

  await sqlite.execute('DELETE FROM order_items');
  await sqlite.execute('DELETE FROM orders');

  for (const order of orders) {
    const subtotal = order.items.reduce((sum, item) => {
      const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
      return sum + item.qty * item.unitPrice + addonTotal;
    }, 0);
    const chargesSum = (order.extraCharges ?? []).reduce((s, c) => s + c.amount, 0);
    const totalAmount = Math.max(0, subtotal + chargesSum - (order.discount ?? 0));

    await sqlite.execute(
      'INSERT INTO orders (id, code, order_type, customer_name, status, amount, discount, payment_method, cash_amount, upi_amount, note, created_at, updated_at, completed_at, extra_charges) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        order.id,
        order.code,
        order.type,
        order.customerName ?? null,
        order.status,
        totalAmount,
        order.discount ?? 0,
        order.paymentMethod ?? null,
        order.cashAmount ?? null,
        order.upiAmount ?? null,
        order.note ?? null,
        order.createdAt,
        order.updatedAt,
        order.completedAt ?? null,
        order.extraCharges ? JSON.stringify(order.extraCharges) : null,
      ]
    );

    for (const item of order.items) {
      await sqlite.execute(
        'INSERT INTO order_items (id, order_id, menu_item_id, name, qty, unit_price, counts_in_sales, kot_printed_qty, addons) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), order.id, item.menuItemId ?? null, item.name, item.qty, item.unitPrice, item.countsInSales ? 1 : 0, item.kotPrintedQty ?? 0, item.addons ? JSON.stringify(item.addons) : null]
      );
    }
  }
}

// ── Menu ───────────────────────────────────────────────
export async function dbGetMenuItems(): Promise<MenuItem[]> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return [];

  const rows = await sqlite.select<{
    id: string;
    name: string;
    localized_name_hi: string | null;
    price: number;
    category: string;
    description: string | null;
    image: string | null;
    is_non_profit: number | null;
    is_active: number | null;
    addons: string | null;
    created_at: string;
  }>('SELECT * FROM menu_items');

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    localizedNameHi: row.localized_name_hi ?? undefined,
    price: Number(row.price),
    category: row.category as MenuItem['category'],
    description: row.description ?? undefined,
    image: row.image ?? undefined,
    isNonProfit: row.is_non_profit == null ? false : Boolean(row.is_non_profit),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    addons: row.addons ? JSON.parse(row.addons) : undefined,
    createdAt: row.created_at,
  }));
}

export async function dbGetMenuCategories(): Promise<string[]> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return [];

  const rows = await sqlite.select<{ name: string }>('SELECT name FROM menu_categories ORDER BY sort_order');
  return rows.map(row => row.name);
}

export async function dbSaveMenuItems(items: MenuItem[]): Promise<void> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return;

  await sqlite.execute('DELETE FROM menu_items');
  for (const item of items) {
    await sqlite.execute(
      'INSERT INTO menu_items (id, name, localized_name_hi, price, category, description, image, is_non_profit, is_active, addons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        item.id,
        item.name,
        item.localizedNameHi ?? null,
        item.price,
        item.category,
        item.description ?? null,
        item.image ?? null,
        item.isNonProfit ? 1 : 0,
        item.isActive ? 1 : 0,
        item.addons ? JSON.stringify(item.addons) : null,
        item.createdAt,
      ]
    );
  }
}

export async function dbSaveMenuCategories(categories: string[]): Promise<void> {
  if (!isTauri()) throw new Error('SQLite persistence requires Tauri runtime');

  await ensureSqlite();
  if (!sqlite) return;

  await sqlite.execute('DELETE FROM menu_categories');
  const now = new Date().toISOString();
  for (const [index, name] of categories.entries()) {
    await sqlite.execute(
      'INSERT INTO menu_categories (name, sort_order, created_at) VALUES (?, ?, ?)',
      [name, index, now]
    );
  }
}
