import { APP_CONFIG } from "../config/appConfig";
import type { MenuItem, Order, OrderItem, Sale, ExtraCharge } from "../types";
import { formatCurrency } from "../utils/currencyUtils";
import { updateOrder as updateOrderService } from "./orderService";
import { getPrinterSettings, printReceipt } from "./printerService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrintableLine = {
  name: string;
  hindiName: string;
  qty: number;
  unitPrice?: number;
  lineTotal?: number;
  addons?: { name: string; hindiName: string; price: number }[];
};

export type PrintableDocumentKind = "bill" | "kot";

type PrintableOrder = Pick<Order, "code" | "discount" | "note" | "items" | "extraCharges">;
type PrintableSale = Pick<
  Sale,
  "orderCode" | "discount" | "note" | "items" | "amount" | "extraCharges"
>;

export interface PrintableDocument {
  kind: PrintableDocumentKind;
  title: string;
  orderId: string;
  /** ISO datetime string produced by new Date().toLocaleString("en-IN") */
  generatedAt: string;
  orderType?: "SERVE" | "PACK";
  customerName?: string;
  tableName?: string;
  contactNumber?: string;
  note?: string;
  lines: PrintableLine[];
  discount?: number;
  total?: number;
  /** Optional logo — absolute URL or data-URI rendered above restaurant name */
  logoUrl?: string;
  extraCharges?: ExtraCharge[];
}

export interface PrintAdapter {
  print(document: PrintableDocument): Promise<void>;
}



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMenuMap(menuItems: MenuItem[]): Map<string, MenuItem> {
  return new Map(menuItems.map((item) => [item.id, item]));
}

function escapeHtml(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let cachedLogoDataUri: string | null = null;

export async function getLogoDataUri(): Promise<string> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const res = await fetch('/outlined-logo.png');
    if (!res.ok) throw new Error(`Failed to fetch logo: ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogoDataUri = reader.result as string;
        resolve(cachedLogoDataUri);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('getLogoDataUri failed, falling back to path:', err);
    return '/outlined-logo.png';
  }
}

// Pre-fetch logo at startup
if (typeof window !== 'undefined') {
  void getLogoDataUri();
}

// ---------------------------------------------------------------------------
// Bill HTML Template
// ---------------------------------------------------------------------------

export function buildBillHtml(
  document: PrintableDocument,
  paperWidthMm: number = 80,
): string {
  const linesHtml = document.lines
    .map(
      (line) => {
        const addonsHtml = (line.addons ?? []).map(a =>
          `<div class="addon-line">↳ ${escapeHtml(a.name)}${a.price > 0 ? ` <span class="addon-price">+${escapeHtml(formatCurrency(a.price))}</span>` : ' <span class="addon-price addon-free">free</span>'}</div>`
        ).join('');
        return `
      <div class="line">
        <div class="line-main">
          <div class="item-name">${escapeHtml(line.name)}</div>
          <div class="line-total">${escapeHtml(formatCurrency(line.lineTotal ?? 0))}</div>
        </div>
        <div class="line-meta">${line.qty} x ${escapeHtml(formatCurrency(line.unitPrice ?? 0))}</div>
        ${addonsHtml}
      </div>`;
      },
    )
    .join("");

  const chargesHtml = (document.extraCharges ?? [])
    .map(c => `<div class="total-row"><span>${escapeHtml(c.label)}</span>+ ${escapeHtml(formatCurrency(c.amount))}</div>`)
    .join('');

  const discountHtml =
    document.discount && document.discount > 0
      ? `<div class="total-row"><span>Discount</span>- ${escapeHtml(formatCurrency(document.discount))}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('/fonts/noto-sans-devanagari-400.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('/fonts/noto-sans-devanagari-700.woff2') format('woff2');
      }

      :root { color-scheme: light; --paper: ${paperWidthMm}mm; }
      * { box-sizing: border-box; }

      @page {
        size: var(--paper) auto;
        margin: 0;
      }

      html, body {
        width: 80mm;
        zoom: calc(${paperWidthMm} / 80);
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        font-family: 'Noto Sans Devanagari', 'Segoe UI', system-ui, sans-serif;
        color: #111;
        padding: 8px 10px 16px;
      }

      .receipt { width: 100%; }

      .flex-center {
        display:flex;
        justify-content: center;
        align-items: center;
        margin: 10px 20px;
      }
      .flex-between {
        display:flex;
        justify-content: space-between;
        align-items: center;
        margin: 0px 20px;
        gap: 10px;
      }

      /* Brand */
      .brand {
        margin-bottom: 4px;
      }
      .logo {
        display: block;
        margin: 0 auto 4px;
        max-width: 48px;
        max-height: 48px;
        object-fit: contain;
        filter: grayscale(100%);
      }
      .brand-name {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0.12em;
        padding: 1px 8px;
      }
      .brand-tagline {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.12em;
        padding: 1px 8px;
      }
      .address { font-size: 11px; padding: 0px 4px; }
      .contact { font-size: 13px; font-weight: 600; }

      /* Meta */
      .meta {
        font-size: 12px;
        display: grid;
        gap: 2px;
        margin-bottom: 8px;
      }

      /* Items */
      .divider {
        margin: 25px 0;
        border-bottom: 2px dashed #111;
      }

      .line {
        padding: 5px 0;
        border-bottom: 1px dotted #ccc;
      }
      .line-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 6px;
      }
      .item-name  { font-size: 15px; font-weight: 500; flex: 1; }
      .line-total { font-size: 14px; font-weight: 600; white-space: nowrap; }
      .line-meta  { font-size: 12px; color: #555; margin-top: 1px; }
      .addon-line { font-size: 11px; color: #555; padding-left: 10px; margin-top: 2px; }
      .addon-price { font-weight: 600; color: #333; }
      .addon-free  { color: #888; }

      /* Totals */
      .totals {
        margin-top: 8px;
        padding-top: 6px;
        display: grid;
        gap: 3px;
      }
      .total-row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; }
      .total-grand { font-size: 16px; font-weight: 700; }

      /* Footer */
      .footer {
        margin-top: 25px;
        text-align: center;
        font-size: 17px;
      }
      .footer .thank-you { font-weight: 700; font-size: 16px; }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="brand">
        <div class="flex-center">
          <div><img class="logo" src="${escapeHtml(document.logoUrl || '/outlined-logo.png')}" alt="Logo" /></div>
          <div>
            <div class="brand-name">${escapeHtml(APP_CONFIG.restaurantName)}</div>
            <div class="brand-tagline">${escapeHtml(APP_CONFIG.restaurantTagline)}</div>
          </div>
        </div>
        <div class="flex-between address">${escapeHtml(APP_CONFIG.restaurantAddress)}</div>
        <div class="flex-center contact">Phone: ${escapeHtml(APP_CONFIG.contactNumber)}</div>
      </div>

      <div class="flex-center" style="font-weight: 700; margin-top: 25px;">BILL</div>

      <div class="meta">
        <div class="">Order ID: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;#${escapeHtml(document.orderId)}</div>
        <div class="">Date & Time:&nbsp;&nbsp;&nbsp;&nbsp; ${escapeHtml(document.generatedAt)}</div>
      </div>

      <div class="divider"></div>
      
      ${linesHtml}
      
      <div class="totals">
        ${chargesHtml}
        ${discountHtml}
        <div class="total-row total-grand">
        <span>Total</span>
        ${escapeHtml(formatCurrency(document.total ?? 0))}
        </div>
      </div>

      <div class="divider"></div>
      
      <div class="footer">
        <div class="thank-you">Thank You!</div>
        <div>Visit Again</div>
      </div>
    </div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// KOT HTML Template
// ---------------------------------------------------------------------------

export function buildKotHtml(
  document: PrintableDocument,
  paperWidthMm: number = 80,
): string {
  const linesHtml = document.lines
    .map(
      (line) => {
        const addonsHtml = (line.addons ?? []).map(a =>
          `<div class="addon-line">↳ ${escapeHtml(a.hindiName || a.name)}</div>`
        ).join('');
        return `
      <div class="line">
        <div class="line-main">
          <div class="item-name">${escapeHtml(line.hindiName)}</div>
          <div class="qty">x${line.qty}</div>
        </div>
        ${addonsHtml}
      </div>`;
      },
    )
    .join("");

  const noteHtml = document.note?.trim()
    ? `<div class="note"><strong>NOTE: </strong> ${escapeHtml(document.note.trim())}</div>`
    : "";

  const orderTypeHtml = document.orderType
    ? `<div class="badge">${escapeHtml(document.orderType)}</div>`
    : "";

  const customerHtml = document.customerName
    ? `<div class="meta-row">${escapeHtml(document.customerName)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="hi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('/fonts/noto-sans-devanagari-400.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('/fonts/noto-sans-devanagari-700.woff2') format('woff2');
      }

      :root { color-scheme: light; --paper: ${paperWidthMm}mm; }
      * { box-sizing: border-box; }

      @page {
        size: var(--paper) auto;
        margin: 0;
      }

      html, body {
        width: 80mm;
        zoom: calc(${paperWidthMm} / 80);
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        font-family: 'Noto Sans Devanagari', 'Segoe UI', system-ui, sans-serif;
        color: #111;
        padding: 8px 10px 16px;
      }

      .receipt { width: 100%; }

      /* KOT Header */
      .header {
        text-align: center;
        border-bottom: 2px dashed #111;
        padding-bottom: 6px;
        margin-bottom: 6px;
      }
      .kot-title {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0.12em;
        padding: 1px 8px;
        margin: 8px 0 0 0;
      }
      .datetime {
        font-size: 12px;
        color: #444;
        margin-top: 3px;
        padding: 2px 0px;
      }

      /* Badges */
      .badge {
        display: inline-block;
        font-size: 13px;
        font-weight: 800;
        border: 2px solid #111;
        padding: 1px 8px;
        letter-spacing: 0.12em;
        margin: 2px 0;
      }
      .meta-row {
        font-size: 13px;
        font-weight: 700;
        margin-top: 3px;
        padding: 2px 0px;
      }

      /* Items */
      .line {
        padding: 6px;
        border-bottom: 1px dotted #bbb;
      }
      .line-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .item-name { font-size: 16px; font-weight: 500; flex: 1; }
      .qty       { font-size: 14px; font-weight: 700; white-space: nowrap; }
      .addon-line { font-size: 13px; color: #444; padding-left: 10px; margin-top: 2px; }

      /* Note */
      .note {
        margin-top: 6px;
        padding: 6px;
        font-size: 13px;
      }

      .flex {
        display: flex;
        justify-content: space-between;
        padding: 5px 10px;
        align-items: flex-end;
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="header">
        <div class="kot-title flex">
          KOT ${orderTypeHtml}
        </div>
        <div class="flex">
          <div>${customerHtml}</div>
          <div class="datetime">${escapeHtml(document.generatedAt)}</div>
        </div>
      </div>

      ${linesHtml}

      ${noteHtml}
    </div>
  </body>
</html>`;
}



// ---------------------------------------------------------------------------
// Tauri Printer Adapter
// ---------------------------------------------------------------------------

class TauriPrinterAdapter implements PrintAdapter {
  async print(document: PrintableDocument): Promise<void> {
    const settings = await getPrinterSettings();
    const html =
      document.kind === "kot"
        ? buildKotHtml(document, settings.paperWidthMm)
        : buildBillHtml(document, settings.paperWidthMm);

    await printReceipt(html, settings.printerName);
  }
}

const activePrinter: PrintAdapter = new TauriPrinterAdapter();

// ---------------------------------------------------------------------------
// Internal helpers (UNCHANGED)
// ---------------------------------------------------------------------------

function sumItems(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
    return sum + item.qty * item.unitPrice + addonTotal;
  }, 0);
}

function buildLines(
  items: OrderItem[],
  menuItems: MenuItem[],
): PrintableLine[] {
  const menuById = getMenuMap(menuItems);
  return items.map((item) => {
    const menuItem = item.menuItemId
      ? menuById.get(item.menuItemId)
      : undefined;
    const sourceName = menuItem?.name ?? item.name;
    const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
    return {
      name: sourceName,
      hindiName: menuItem?.localizedNameHi?.trim() || sourceName,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.qty * item.unitPrice + addonTotal,
      addons: (item.addons ?? []).map(a => ({
        name: a.qty && a.qty > 1 ? `${a.name} ×${a.qty}` : a.name,
        hindiName: a.localizedNameHi
          ? (a.qty && a.qty > 1 ? `${a.localizedNameHi} ×${a.qty}` : a.localizedNameHi)
          : (a.qty && a.qty > 1 ? `${a.name} ×${a.qty}` : a.name),
        price: (a.qty ?? 1) * a.price,
      })),
    };
  });
}

function buildBillDocument(
  source: PrintableOrder | PrintableSale,
  menuItems: MenuItem[],
  orderId: string,
  total: number,
): PrintableDocument {
  const items = source.items;
  const discount = source.discount ?? 0;
  return {
    kind: "bill",
    title: `${APP_CONFIG.restaurantName} - Bill`,
    orderId,
    contactNumber: APP_CONFIG.contactNumber || undefined,
    lines: buildLines(items as OrderItem[], menuItems),
    discount,
    total,
    note: source.note,
    generatedAt: new Date().toLocaleString("en-IN"),
    logoUrl: "/outlined-logo.png",
    extraCharges: source.extraCharges,
  };
}

function buildKotDocument(
  order: PrintableOrder,
  menuItems: MenuItem[],
): PrintableDocument {
  const menuById = getMenuMap(menuItems);
  const lines: PrintableLine[] = [];
  for (const item of order.items) {
    const printed = (item as any).kotPrintedQty ?? 0;
    const remaining = Math.max(0, item.qty - printed);
    if (remaining <= 0) continue;
    const menuItem = item.menuItemId
      ? menuById.get(item.menuItemId)
      : undefined;
    const sourceName = menuItem?.name ?? item.name;
    lines.push({
      name: sourceName,
      hindiName: menuItem?.localizedNameHi?.trim() || sourceName,
      qty: remaining,
      unitPrice: item.unitPrice,
      lineTotal: item.qty * item.unitPrice,
      addons: (item.addons ?? []).map(a => ({
        name: a.qty && a.qty > 1 ? `${a.name} ×${a.qty}` : a.name,
        hindiName: a.localizedNameHi
          ? (a.qty && a.qty > 1 ? `${a.localizedNameHi} ×${a.qty}` : a.localizedNameHi)
          : (a.qty && a.qty > 1 ? `${a.name} ×${a.qty}` : a.name),
        price: (a.qty ?? 1) * a.price,
      })),
    });
  }

  return {
    kind: "kot",
    title: `${APP_CONFIG.restaurantName} - KOT`,
    orderId: order.code,
    lines,
    discount: 0,
    total: 0,
    note: order.note,
    generatedAt: new Date().toLocaleString("en-IN"),
  };
}

// ---------------------------------------------------------------------------
// Public print functions (UNCHANGED signatures)
// ---------------------------------------------------------------------------

export async function printOrderBill(
  order: Order,
  menuItems: MenuItem[],
): Promise<void> {
  const subtotal = sumItems(order.items);
  const chargesSum = (order.extraCharges ?? []).reduce((s, c) => s + c.amount, 0);
  const total = Math.max(0, subtotal + chargesSum - (order.discount ?? 0));
  const doc = buildBillDocument(order, menuItems, order.code, total);
  doc.logoUrl = await getLogoDataUri();
  await activePrinter.print(doc);
}

export async function printOrderKot(
  order: Order,
  menuItems: MenuItem[],
): Promise<void> {
  const doc = buildKotDocument(order, menuItems);
  if (!doc.lines || doc.lines.length === 0) {
    throw new Error("No new KOT items to print");
  }

  await activePrinter.print(doc);

  // After successful print, mark printed quantities on order items
  const updatedItems = order.items.map((item) => {
    const printed = item.kotPrintedQty ?? 0;
    const remaining = Math.max(0, item.qty - printed);
    const newPrinted = printed + remaining;
    return { ...item, kotPrintedQty: newPrinted };
  });

  try {
    await updateOrderService(order.id, { items: updatedItems });
  } catch (err) {
    // Non-fatal: printing succeeded but updating DB failed.
    console.warn("Failed to update order after KOT print", err);
    throw err instanceof Error
      ? err
      : new Error("Failed to update printed KOT status");
  }
}

export async function printSaleBill(
  sale: Sale,
  menuItems: MenuItem[],
): Promise<void> {
  const subtotal = sumItems(sale.items as OrderItem[]);
  const chargesSum = (sale.extraCharges ?? []).reduce((s, c) => s + c.amount, 0);
  const total =
    sale.amount ??
    Math.max(0, subtotal + chargesSum - (sale.discount ?? 0));
  const orderId = sale.orderCode ?? sale.id;
  const doc = buildBillDocument(sale as PrintableSale, menuItems, orderId, total);
  doc.logoUrl = await getLogoDataUri();
  await activePrinter.print(doc);
}
