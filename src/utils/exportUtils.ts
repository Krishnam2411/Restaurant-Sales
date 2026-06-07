import type { Sale } from '../types';
import { APP_CONFIG } from '../config/appConfig';
import { formatCurrency } from './currencyUtils';
import { isTauri } from './tauri';
import { getSalesByDateRange } from '../services/salesService';
import { getSetting } from '../services/db';
import { jsPDF } from 'jspdf';
import { join } from '@tauri-apps/api/path';
import { writeFile } from '@tauri-apps/plugin-fs';
import ExcelJS, { type FillPattern, type Color } from 'exceljs';
import brandLogo from '../assets/aalsi-chatore-mascot.png';

type ExportTheme = {
  primary: string;
  accent: string;
  text: string;
  muted: string;
  headerBg: string;
  headerBorder: string;
};

const DEFAULT_EXPORT_THEME: ExportTheme = {
  primary: '#7a4b1f',
  accent: '#c98b2e',
  text: '#2a1a10',
  muted: '#8b6a4b',
  headerBg: '#fff6e8',
  headerBorder: '#e9c27d',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatPdfCurrency(amount: number): string {
  return formatCurrency(amount).replace('₹', 'Rs. ');
}

function formatLongDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const day = parsed.getDate();
  const month = months[parsed.getMonth()] ?? '';
  const year = parsed.getFullYear();
  return `${day} ${month}, ${year}`;
}

function getExportTheme(): ExportTheme {
  return {
    ...DEFAULT_EXPORT_THEME,
    ...(APP_CONFIG.exportTheme ?? {}),
  };
}

function hexToArgb(value: string, fallback: string): string {
  const normalized = value.replace('#', '').trim().toUpperCase();

  if (normalized.length === 3) {
    const expanded = normalized
      .split('')
      .map(char => char + char)
      .join('');

    return `FF${expanded}`;
  }

  if (normalized.length === 6) {
    return `FF${normalized}`;
  }

  return fallback;
}

function parseHexColor(value: string, fallback: [number, number, number]): [number, number, number] {
  const normalized = value.replace('#', '').trim();
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    return [r, g, b];
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return [r, g, b];
  }
  return fallback;
}

function rgbFromHex(value: string, fallback: [number, number, number]): [number, number, number] {
  const parsed = parseHexColor(value, fallback);
  if (parsed.some(Number.isNaN)) {
    return fallback;
  }
  return parsed;
}

async function loadImageDataUrl(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

const EXPORT_FOLDER_SETTING_KEY = 'restrosales__exportFolderPath';

async function getExportDestination(filename: string): Promise<string | null> {
  if (!isTauri()) return null;
  const folderPath = (await getSetting(EXPORT_FOLDER_SETTING_KEY))?.trim();
  if (!folderPath) return null;
  return join(folderPath, filename);
}

export async function exportSalesXLSXForDate(date: string): Promise<void> {
  try {
    const sales = await getSalesByDateRange(date, date);
    const totalSales = sales.reduce((sum, sale) => sum + (sale.amount ?? 0), 0);
    const formattedDate = formatLongDate(date);
    const theme = getExportTheme();
    const logoBuffer = await fetch(brandLogo)
      .then(res => res.arrayBuffer())
      .catch(() => null);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales Ledger');
    
    sheet.views = [
      {
        state: 'frozen',
        ySplit: 5,
      },
    ];

    sheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
    };

    sheet.columns = [
      { width: 16 },
      { width: 12 },
      { width: 10 },
      { width: 36 },
      { width: 16 },
      { width: 14 },
    ];

    sheet.addRow(['', '', '', '', '', '']);
    sheet.addRow(['', '', '', '', '', '']);
    sheet.addRow(['', '', '', '', '', '']);
    sheet.addRow(['', '', '', '', '', '']);

    sheet.addRow([
      'Date',
      'Type',
      'Time',
      'Items',
      'Amount',
      'Payment',
    ]);

    sales.forEach(sale => {
      sheet.addRow([
        sale.date,
        sale.channel ?? '',
        sale.time,
        sale.items?.map(
          item => `${item.qty} x ${item.name} @ ${item.unitPrice}`
        ).join('\n') ?? sale.freeText ?? '',
        formatPdfCurrency(sale.amount ?? 0),
        sale.paymentMethod,
      ]);
    });

    // sheet.mergeCells('A1:A2');
    sheet.mergeCells('A1:D1');
    sheet.mergeCells('A2:D2');
    sheet.mergeCells('E1:F1');
    sheet.mergeCells('E2:F2');
    sheet.mergeCells('A3:B3');
    sheet.mergeCells('C3:D3');

    sheet.getCell('A1').value = `              ${APP_CONFIG.restaurantName}`;
    sheet.getCell('A2').value = `                     ${APP_CONFIG.restaurantTagline}`;

    sheet.getCell('E1').value = 'Sales Ledger     ';
    sheet.getCell('E2').value = `${formattedDate}      `;

    sheet.getCell('A3').value = `Total Sales: ${formatCurrency(totalSales)}`;
    sheet.getCell('C3').value = `Orders: ${sales.length}`;

    const headerFill: FillPattern = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: hexToArgb(theme.headerBg, 'FFFFF6E8'),
      } as Color,
    };

    const accentFill: FillPattern = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: hexToArgb(theme.accent, 'FFC98B2E'),
      } as Color,
    };

    const tableHeaderFill: FillPattern = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: hexToArgb(theme.headerBorder, 'FFE9C27D'),
      } as Color,
    };

    const textColor = { argb: hexToArgb(theme.text, 'FF2A1A10') };
    const mutedColor = { argb: hexToArgb(theme.muted, 'FF8B6A4B') };

    sheet.getRow(1).height = 36;
    sheet.getRow(2).height = 30;
    sheet.getRow(3).height = 30;
    sheet.getRow(4).height = 6;
    sheet.getRow(5).height = 24;

    const headerRows = [1, 2, 3];
    headerRows.forEach(rowNumber => {
      const row = sheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = headerFill;
        cell.alignment = { vertical: 'middle' };
      });
    });

    sheet.getCell('B1').font = {
      bold: true,
      size: 18,
      color: textColor,
    };

    sheet.getCell('B2').font = {
      size: 12,
      color: mutedColor,
    };

    sheet.getCell('E1').font = {
      bold: true,
      size: 14,
      color: textColor,
    };

    sheet.getCell('E2').font = {
      size: 12,
      color: mutedColor,
    };

    sheet.getRow(3).font = {
      bold: true,
      color: textColor,
    };
    
    sheet.getCell('A3').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    
    sheet.getCell('C3').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };

    sheet.getCell('B1').alignment = {
      vertical: 'bottom',
    };

    sheet.getCell('B2').alignment = {
      vertical: 'top',
    };

    sheet.getCell('E1').alignment = {
      horizontal: 'right',
      vertical: 'bottom',
    };

    sheet.getCell('E2').alignment = {
      horizontal: 'right',
      vertical: 'top',
    };

    const accentRow = sheet.getRow(4);
    accentRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill = accentFill;
    });

    const tableHeaderRow = sheet.getRow(5);
    tableHeaderRow.font = { bold: true, color: textColor };
    tableHeaderRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill = tableHeaderFill;
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      cell.border = {
        bottom: {
          style: 'thin',
          color: { argb: 'FFD0D0D0' },
        },
      };
    });

    for (let i = 6; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      
      row.alignment = { 
        vertical: 'middle', 
        horizontal: 'center', 
        wrapText: true 
      };

      row.eachCell({ includeEmpty: true }, cell => {
        cell.border = {
          bottom: {
            style: 'thin',
            color: { argb: 'FFE5D7C4' },
          },
        };
      });

      const itemsCell = row.getCell(4);

      const lines = String(itemsCell.value ?? '')
        .split('\n')
        .length;

      row.height = Math.max(20, lines * 15);
    }

    if (logoBuffer) {
      const logoId = workbook.addImage({
        buffer: logoBuffer,
        extension: 'png',
      });

      sheet.addImage(logoId, {
        tl: {
          col: 0.75,
          row: 0.35,
        },
        ext: {
          width: 55,
          height: 55,
        },
      });
    }

    sheet.autoFilter = {
      from: 'A5',
      to: 'F5',
    };

    const fileBuffer = await workbook.xlsx.writeBuffer();
    const filename = `sales_${date}.xlsx`;
    const destination = await getExportDestination(filename);

    if (destination) {
      await writeFile(destination, new Uint8Array(fileBuffer));
      return;
    }

    const blob = new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, filename);
  } catch (err) {
    console.warn('Failed to export XLSX for date', date, err);
    throw err;
  }
}

async function buildLedgerPdf(sales: Sale[], date: string): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const contentWidth = pageWidth - marginX * 2;
  const totalSales = sales.reduce((sum, sale) => sum + (sale.amount ?? 0), 0);
  const formattedDate = formatLongDate(date);
  const theme = getExportTheme();
  const logoDataUrl = await loadImageDataUrl(brandLogo).catch(() => null);
  const headerBg = rgbFromHex(theme.headerBg, [255, 246, 232]);
  const headerAccent = rgbFromHex(theme.accent, [201, 139, 46]);
  const headerBorder = rgbFromHex(theme.headerBorder, [233, 194, 125]);
  const textColor = rgbFromHex(theme.text, [42, 26, 16]);
  const mutedColor = rgbFromHex(theme.muted, [139, 106, 75]);

  const headerBottom = 98;
  const tableHeaderY = headerBottom + 16;
  const tableLineY = tableHeaderY + 6;
  const bodyStartY = tableLineY + 12;

  const columnWidths = [64, 72, 64, 0, 72, 64];
  columnWidths[3] = contentWidth - columnWidths.reduce((sum, width) => sum + width, 0);
  const columnX = [
    marginX,
    marginX + columnWidths[0],
    marginX + columnWidths[0] + columnWidths[1],
    marginX + columnWidths[0] + columnWidths[1] + columnWidths[2],
    marginX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3],
    marginX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4],
  ];

  const drawTableHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...textColor);
    doc.text('Date', columnX[0], tableHeaderY);
    doc.text('Type', columnX[1], tableHeaderY);
    doc.text('Time', columnX[2], tableHeaderY);
    doc.text('Items', columnX[3], tableHeaderY);
    doc.text('Amount', columnX[4], tableHeaderY);
    doc.text('Payment', columnX[5], tableHeaderY);

    doc.setDrawColor(210);
    doc.line(marginX, tableLineY, pageWidth - marginX, tableLineY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0);
  };

  const drawHeader = () => {
    doc.setFillColor(...headerBg);
    doc.rect(0, 0, pageWidth, headerBottom, 'F');
    doc.setFillColor(...headerAccent);
    doc.rect(0, headerBottom - 6, pageWidth, 6, 'F');

    const logoSize = 38;
    const logoY = 22;
    const textX = marginX + (logoDataUrl ? logoSize + 10 : 0);

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', marginX, logoY, logoSize, logoSize);
    }

    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(APP_CONFIG.restaurantName, textX, 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text(APP_CONFIG.restaurantTagline, textX, 52);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.text('Sales Ledger', pageWidth - marginX, 38, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(formattedDate, pageWidth - marginX, 52, { align: 'right' });

    doc.setFontSize(9);
    doc.text(`Total Sales: ${formatPdfCurrency(totalSales)}`, marginX, 74);
    doc.text(`Orders: ${sales.length}`, marginX + 180, 74);

    doc.setDrawColor(...headerBorder);
    doc.line(marginX, headerBottom, pageWidth - marginX, headerBottom);
  };

  const addPageIfNeeded = (y: number, rowHeight: number): number => {
    if (y + rowHeight <= pageHeight - 42) {
      return y;
    }
    doc.addPage();
    drawHeader();
    drawTableHeader();
    return bodyStartY;
  };

  const writeRow = (sale: Sale, y: number): number => {
    const itemsText = sale.items && sale.items.length > 0
      ? sale.items.map(item => `${item.qty} x ${item.name} @ ${item.unitPrice}`).join('\n')
      : (sale.freeText ?? '');

    const cells = [
      doc.splitTextToSize(sale.date, columnWidths[0] - 4),
      doc.splitTextToSize(sale.channel ?? '', columnWidths[1] - 4),
      doc.splitTextToSize(sale.time, columnWidths[2] - 4),
      doc.splitTextToSize(itemsText, columnWidths[3] - 4),
      doc.splitTextToSize(formatPdfCurrency(sale.amount ?? 0), columnWidths[4] - 4),
      doc.splitTextToSize(sale.paymentMethod, columnWidths[5] - 4),
    ];

    const rowHeight = Math.max(...cells.map(cell => Math.max(cell.length, 1))) * 11 + 8;
    const nextY = addPageIfNeeded(y, rowHeight);

    cells.forEach((cell, index) => {
      doc.text(cell, columnX[index], nextY);
    });
    doc.setDrawColor(235);
    doc.line(marginX, nextY + rowHeight - 12, pageWidth - marginX, nextY + rowHeight - 12);

    return nextY + rowHeight;
  };

  drawHeader();
  drawTableHeader();

  let cursorY = bodyStartY;
  if (sales.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(107);
    doc.text(`No sales for ${formattedDate}`, marginX, cursorY);
  } else {
    for (const sale of sales) {
      cursorY = writeRow(sale, cursorY);
    }
  }

  const footerY = Math.min(cursorY + 10, pageHeight - 28);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated by ${APP_CONFIG.appName}`, marginX, footerY);

  return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportSalesPDFForDate(date: string): Promise<void> {
  try {
    const sales = await getSalesByDateRange(date, date);
    const pdfBytes = await buildLedgerPdf(sales, date);
    const filename = `sales_${date}.pdf`;

    const destination = await getExportDestination(filename);
    if (destination) {
      await writeFile(destination, pdfBytes);
      return;
    }

    const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    downloadBlob(new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
  } catch (err) {
    console.warn('Failed to export PDF for date', date, err);
    throw err;
  }
}
