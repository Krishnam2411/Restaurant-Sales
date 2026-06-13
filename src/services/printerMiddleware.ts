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

// ── Font caching and preloading ──
let cachedBaloo2DataUri: string | null = null;
let cachedNoto400DataUri: string | null = null;
let cachedNoto700DataUri: string | null = null;

async function getFontDataUri(path: string, cacheKey: 'baloo2' | 'noto400' | 'noto700'): Promise<string> {
  if (cacheKey === 'baloo2' && cachedBaloo2DataUri) return cachedBaloo2DataUri;
  if (cacheKey === 'noto400' && cachedNoto400DataUri) return cachedNoto400DataUri;
  if (cacheKey === 'noto700' && cachedNoto700DataUri) return cachedNoto700DataUri;

  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to fetch font: ${res.status}`);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (cacheKey === 'baloo2') cachedBaloo2DataUri = result;
        else if (cacheKey === 'noto400') cachedNoto400DataUri = result;
        else if (cacheKey === 'noto700') cachedNoto700DataUri = result;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn(`[printerMiddleware] Failed to preload font ${path}, using fallback:`, err);
    return path;
  }
}

// Pre-fetch fonts at startup
if (typeof window !== 'undefined') {
  void getFontDataUri('/fonts/baloo-2-700.woff2', 'baloo2');
  void getFontDataUri('/fonts/noto-sans-devanagari-400.woff2', 'noto400');
  void getFontDataUri('/fonts/noto-sans-devanagari-700.woff2', 'noto700');
}

// ---------------------------------------------------------------------------
// Bill HTML Template
// ---------------------------------------------------------------------------

export function buildBillHtml(
  document: PrintableDocument,
): string {
  const paperWidthMm = 80;
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
    .map(c => `<div class="total-row"><span>${escapeHtml(c.label)}</span><span>+ ${escapeHtml(formatCurrency(c.amount))}</span></div>`)
    .join('');

  const discountHtml =
    document.discount && document.discount > 0
      ? `<div class="total-row"><span>Discount</span><span>- ${escapeHtml(formatCurrency(document.discount))}</span></div>`
      : "";

  const noteHtml = document.note?.trim()
    ? `<div class="note"><strong>Note:</strong> ${escapeHtml(document.note.trim())}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      @font-face {
        font-family: 'Baloo 2';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${cachedBaloo2DataUri || "/fonts/baloo-2-700.woff2"}') format('woff2');
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('${cachedNoto400DataUri || "/fonts/noto-sans-devanagari-400.woff2"}') format('woff2');
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${cachedNoto700DataUri || "/fonts/noto-sans-devanagari-700.woff2"}') format('woff2');
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      @page {
        size: ${paperWidthMm}mm auto;
        margin: 0;
      }

      html, body {
        width: ${paperWidthMm}mm;
        background: #fff;
        color: #000;
      }

      body {
        font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
        font-size: 10pt;
        padding: 6pt 8pt 16pt;
      }

      /* ── Header ── */
      .header {
        display: flex;
        align-items: center;
        padding-top: 2pt;
        padding-bottom: 5pt;
        width: 100%;
      }
      .logo {
        flex-shrink: 0;
        width: 48pt;
        height: 48pt;
        object-fit: contain;
        filter: grayscale(1) contrast(1.4);
      }
      .header-text {
        width: fit-content;
        flex: 1;
        text-align: left;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      }
      /* Fallback if logo is missing */
      .header:not(:has(.logo)) {
        display: block;
        text-align: center;
      }
      .header:not(:has(.logo)) .header-text {
        text-align: center;
      }
      .brand-name {
        font-family: 'Baloo 2', 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
        font-size: 22.5pt;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1.15;
      }
      .brand-tagline {
        font-size: 12pt;
        font-weight: 600;
        letter-spacing: 0.04em;
        margin-top: 2pt;
      }
      .header-contact {
        text-align: center;
        margin-top: 2pt;
      }
      .address {
        font-size: 9pt;
        margin-top: 2pt;
        line-height: 1.3;
      }
      .contact {
        font-size: 10pt;
        font-weight: 700;
        margin-top: 2pt;
      }

      /* ── Dividers ── */
      .divider {
        border: none;
        border-top: 1pt dashed #000;
        margin: 6pt 0;
      }
      .divider-thin {
        border: none;
        border-top: 0.5pt solid #000;
        margin: 4pt 0;
      }

      /* ── Receipt label ── */
      .receipt-label {
        text-align: center;
        font-size: 11pt;
        font-weight: 900;
        letter-spacing: 0.15em;
        margin-bottom: 4pt;
      }

      /* ── Order meta ── */
      .meta {
        font-size: 10pt;
        line-height: 1.5;
      }
      .meta table {
        width: 100%;
        border-collapse: collapse;
      }
      .meta td { vertical-align: top; }
      .meta td.label { white-space: nowrap; padding-right: 20pt; font-weight: 600; }
      .meta td.value { width: 100%; }

      /* ── Items column header ── */
      .col-header {
        display: flex;
        justify-content: space-between;
        font-size: 9.5pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 3pt 0;
      }

      /* ── Line items ── */
      .line {
        padding: 3.5pt 0;
      }
      .line-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 6pt;
      }
      .item-name  { font-size: 11pt; font-weight: 600; flex: 1; line-height: 1.3; }
      .line-total { font-size: 11pt; font-weight: 700; white-space: nowrap; }
      .line-meta  { font-size: 9.5pt; margin-top: 1pt; }
      .addon-line { font-size: 9pt; padding-left: 8pt; margin-top: 1pt; }
      .addon-price { font-weight: 700; }

      /* ── Totals ── */
      .totals { font-size: 10pt; margin-top: 3pt; }
      .total-row {
        display: flex;
        justify-content: space-between;
        gap: 8pt;
        padding: 2pt 0;
      }
      .total-grand { font-size: 13pt; font-weight: 900; padding: 4pt 0; }

      /* ── Note ── */
      .note { font-size: 9.5pt; margin: 4pt 0; line-height: 1.4; }

      /* ── Footer ── */
      .footer {
        text-align: center;
        padding-top: 6pt;
        font-size: 14pt;
        font-weight: 900;
        line-height: 1.4;
      }
      .footer-sub {
        font-size: 11pt;
        font-weight: 700;
        margin-top: 3pt;
      }
    </style>
  </head>
  <body>
    <!-- HEADER -->
    <div class="header">
      ${document.logoUrl ? `<img class="logo" src="${escapeHtml(document.logoUrl)}" alt="${escapeHtml(APP_CONFIG.restaurantName)}" />` : ''}
      <div class="header-text">
        <div class="brand-name">${escapeHtml(APP_CONFIG.restaurantName)}</div>
        ${APP_CONFIG.restaurantTagline ? `<div class="brand-tagline">${escapeHtml(APP_CONFIG.restaurantTagline)}</div>` : ''}
      </div>
    </div>
    ${APP_CONFIG.restaurantAddress || APP_CONFIG.contactNumber ? `
    <div class="header-contact">
      ${APP_CONFIG.restaurantAddress ? `<div class="address">${escapeHtml(APP_CONFIG.restaurantAddress)}</div>` : ''}
      ${APP_CONFIG.contactNumber ? `<div class="contact">Ph: ${escapeHtml(APP_CONFIG.contactNumber)}</div>` : ''}
    </div>
    ` : ''}

    <hr class="divider" />

    <!-- ORDER META & RECEIPT LABEL -->
    <div class="meta">
      <div class="receipt-label">BILL</div>
      <table>
        <tr><td class="label">Order </td><td class="value">#${escapeHtml(document.orderId)}</td></tr>
        <tr><td class="label">Date</td><td class="value">${escapeHtml(document.generatedAt)}</td></tr>
        ${document.customerName ? `<tr><td class="label">Customer</td><td class="value">${escapeHtml(document.customerName)}</td></tr>` : ''}
      </table>
    </div>

    <hr class="divider" />

    <!-- COLUMN HEADER -->
    <div class="col-header">
      <span>Item</span>
      <span>Amount</span>
    </div>

    <hr class="divider-thin" />

    <!-- LINE ITEMS -->
    ${linesHtml}

    ${noteHtml}

    <!-- TOTALS -->
    <hr class="divider" />

    <div class="totals">
      ${chargesHtml}
      ${discountHtml}
      <div class="total-row total-grand">
        <span>TOTAL</span>
        <span>${escapeHtml(formatCurrency(document.total ?? 0))}</span>
      </div>
    </div>

    <hr class="divider" />

    <!-- FOOTER -->
    <div class="footer">
      Thank You!
      <div class="footer-sub">Visit Again</div>
    </div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// KOT HTML Template
// ---------------------------------------------------------------------------

export function buildKotHtml(
  document: PrintableDocument,
): string {
  const paperWidthMm = 80;
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
        src: url('${cachedNoto400DataUri || "/fonts/noto-sans-devanagari-400.woff2"}') format('woff2');
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${cachedNoto700DataUri || "/fonts/noto-sans-devanagari-700.woff2"}') format('woff2');
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      @page {
        size: ${paperWidthMm}mm auto;
        margin: 0;
      }

      html, body {
        width: ${paperWidthMm}mm;
        background: #fff;
        color: #000;
      }

      body {
        font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
        font-size: 10pt;
        padding: 6pt 8pt 16pt;
      }

      .receipt { width: 100%; }

      /* KOT Header */
      .header {
        text-align: center;
        border-bottom: 1.5pt dashed #000;
        padding-bottom: 6pt;
        margin-bottom: 6pt;
      }
      .kot-title {
        font-size: 20pt;
        font-weight: 900;
        letter-spacing: 0.12em;
        margin-top: 6pt;
      }
      .datetime {
        font-size: 9.5pt;
        margin-top: 2pt;
      }

      /* Badges */
      .badge {
        display: inline-block;
        font-size: 10pt;
        font-weight: 800;
        border: 1.5pt solid #000;
        padding: 2pt 8pt;
        letter-spacing: 0.08em;
      }
      .meta-row {
        font-size: 10pt;
        font-weight: 700;
        margin-top: 2pt;
      }

      /* Items */
      .line {
        padding: 4pt 0;
      }
      .line-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8pt;
      }
      .item-name { font-size: 14pt; font-weight: 700; flex: 1; line-height: 1.3; }
      .qty       { font-size: 14pt; font-weight: 900; white-space: nowrap; }
      .addon-line { font-size: 11pt; padding-left: 10pt; margin-top: 2pt; font-weight: 600; }

      /* Note */
      .note {
        margin-top: 6pt;
        padding: 4pt 0;
        font-size: 11pt;
        line-height: 1.4;
      }

      .flex {
        display: flex;
        justify-content: space-between;
        padding: 4pt 8pt;
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
        ? buildKotHtml(document)
        : buildBillHtml(document);

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
