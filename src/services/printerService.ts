/**
 * printerService.ts
 *
 * Frontend API for native Tauri printing.
 * All heavy-lifting (printer enumeration, silent print, preview) happens in Rust.
 */

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

/**
 * Single-printer settings.
 *
 * Designed for easy future expansion:
 *   billPrinterName?: string;
 *   kotPrinterName?: string;
 *
 * without changing business logic — just add optional fields here and in Rust.
 */
export interface PrinterSettings {
  printerName: string;
  /** Receipt paper roll width in mm. Common values: 58, 72, 76, 80. Default 80. */
  paperWidthMm: number;
}

const DEFAULT_SETTINGS: PrinterSettings = {
  printerName: "",
  paperWidthMm: 80,
};

// ---------------------------------------------------------------------------
// Printer Discovery
// ---------------------------------------------------------------------------

/**
 * Returns all printers installed on the system.
 * On Windows: uses wmic / Win32 API via Rust.
 */
export async function getPrinters(): Promise<PrinterInfo[]> {
  try {
    return await invoke<PrinterInfo[]>("list_printers");
  } catch (err) {
    console.error("[printerService] list_printers failed:", err);
    return [];
  }
}

/**
 * Returns the OS default printer name.
 */
export async function getDefaultSystemPrinter(): Promise<string> {
  try {
    return await invoke<string>("get_default_printer");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Loads printer settings from $APPDATA/com.aalsi.chatore.sales/printer_settings.json
 */
export async function getPrinterSettings(): Promise<PrinterSettings> {
  try {
    const raw = await invoke<PrinterSettings>("get_printer_settings");
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Saves printer settings to persistent storage.
 */
export async function savePrinterSettings(
  settings: PrinterSettings,
): Promise<void> {
  await invoke("save_printer_settings", { settings });
}

/**
 * Convenience: set only the printer name, preserving other settings.
 */
export async function setPrinter(name: string): Promise<void> {
  const current = await getPrinterSettings();
  await savePrinterSettings({ ...current, printerName: name });
}

/**
 * Convenience: get just the selected printer name.
 */
export async function getSelectedPrinter(): Promise<string> {
  const s = await getPrinterSettings();
  return s.printerName;
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/**
 * Silently prints an HTML receipt to the named printer.
 * No browser popup — handled entirely in Rust via ShellExecuteW (Windows)
 * or `lpr` (macOS/Linux).
 *
 * @param html       Full HTML document string (from buildBillHtml / buildKotHtml)
 * @param printerName  Name of the target printer (from PrinterSettings.printerName)
 */
export async function printReceipt(
  html: string,
  printerName: string,
): Promise<void> {
  await invoke("print_html_receipt", { html, printerName });
}

/**
 * Opens a visible preview window sized to match the configured paper width.
 * The preview window contains a Print button that opens the system dialog
 * for user confirmation before sending to the printer.
 *
 * @param html  Full HTML document string
 */
export async function previewReceipt(html: string): Promise<void> {
  await invoke("preview_html_receipt", { html });
}
