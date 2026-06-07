/**
 * usePrinterSettings.ts
 *
 * React hook for printer discovery and settings management.
 * Ready for use in a Settings page component.
 */

import { useCallback, useEffect, useState } from "react";
import {
  type PrinterInfo,
  type PrinterSettings,
  getDefaultSystemPrinter,
  getPrinterSettings,
  getPrinters,
  savePrinterSettings,
} from "../services/printerService";

export interface UsePrinterSettingsReturn {
  /** All printers installed on the system */
  printers: PrinterInfo[];
  /** Current saved settings */
  settings: PrinterSettings;
  /** Whether a load/save operation is in progress */
  isLoading: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Select a printer by name and save */
  setPrinter: (name: string) => Promise<void>;
  /** Change paper width and save */
  setPaperWidth: (widthMm: number) => Promise<void>;
  /** Save arbitrary partial settings */
  updateSettings: (patch: Partial<PrinterSettings>) => Promise<void>;
  /** Refresh the printer list */
  refreshPrinters: () => Promise<void>;
}

const SUPPORTED_PAPER_WIDTHS: number[] = [58, 72, 76, 80];
export { SUPPORTED_PAPER_WIDTHS };

export function usePrinterSettings(): UsePrinterSettingsReturn {
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [settings, setSettings] = useState<PrinterSettings>({
    printerName: "",
    paperWidthMm: 80,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load printers and current settings from Rust backend */
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [printerList, currentSettings, defaultPrinter] = await Promise.all([
        getPrinters(),
        getPrinterSettings(),
        getDefaultSystemPrinter(),
      ]);

      setPrinters(printerList);

      // If no printer saved yet, pre-fill with OS default
      const effectiveSettings =
        !currentSettings.printerName && defaultPrinter
          ? { ...currentSettings, printerName: defaultPrinter }
          : currentSettings;

      setSettings(effectiveSettings);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load printer settings",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshPrinters = useCallback(async () => {
    setError(null);
    try {
      const list = await getPrinters();
      setPrinters(list);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh printer list",
      );
    }
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<PrinterSettings>) => {
      setIsLoading(true);
      setError(null);
      try {
        const next = { ...settings, ...patch };
        await savePrinterSettings(next);
        setSettings(next);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save printer settings",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [settings],
  );

  const setPrinter = useCallback(
    (name: string) => updateSettings({ printerName: name }),
    [updateSettings],
  );

  const setPaperWidth = useCallback(
    (widthMm: number) => updateSettings({ paperWidthMm: widthMm }),
    [updateSettings],
  );

  return {
    printers,
    settings,
    isLoading,
    error,
    setPrinter,
    setPaperWidth,
    updateSettings,
    refreshPrinters,
  };
}
