import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import ToastContainer, { showToast } from './components/shared/Toast';
import Modal from './components/shared/Modal';
import AddOrderForm from './components/forms/AddOrderForm';
import { useSalesStore } from './store/salesStore';
import { useMenuStore } from './store/menuStore';
import ManageOrders from './pages/ManageOrders';
import mascot from './assets/aalsi-chatore-mascot.png';
import type { Addon, MenuItem, Order, PaymentMethod, Sale, SaleItem } from './types';
import { isTauri } from './utils/tauri';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { check } from '@tauri-apps/plugin-updater';
import { APP_CONFIG } from './config/appConfig';
import { setTestingMode, isTestingMode as dbIsTesting, clearCurrentDatabase, isAnalyticsExperimentalEnabled, setAnalyticsExperimentalEnabled, getSetting, setSetting } from './services/db';
import * as salesService from './services/salesService';
import { todayISO, nowTime } from './utils/dateUtils';
import { exportSalesXLSXForDate, exportSalesPDFForDate } from './utils/exportUtils';
import { suggestHindiName } from './utils/hindi';
import { compressImageFile } from './utils/imageUtils';
import AppSidebar from './components/app/AppSidebar';
import DashboardTab from './components/app/DashboardTab';
import MenuDrawer from './components/app/MenuDrawer';
import AddonDrawer from './components/app/AddonDrawer';
import AnalyticsTab from './components/app/AnalyticsTab';
import InventoryTab from './components/app/InventoryTab';
import LedgerTab from './components/app/LedgerTab';
import SettingsTab from './components/app/SettingsTab';
import UpdatesTab from './components/app/UpdatesTab';
import type {
  AnalyticsData,
  AnalyticsRange,
  AnalyticsScope,
  LedgerDatePreset,
  LedgerEditState,
  LedgerField,
  LedgerMenuState,
  TabConfig,
  TabKey,
  UpdateStatus,
} from './components/app/appTypes';

const EXPORT_FOLDER_SETTING_KEY = 'restrosales__exportFolderPath';

function shiftSaleDateTime(date: string, time: string, deltaMinutes: number): { date: string; time: string } {
  const dt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(dt.getTime())) {
    return { date: todayISO(), time: nowTime() };
  }

  dt.setMinutes(dt.getMinutes() + deltaMinutes);
  return {
    date: dt.toISOString().slice(0, 10),
    time: dt.toISOString().slice(11, 16),
  };
}

function formatLedgerItems(items: SaleItem[]): string {
  return items.map(item => `${item.qty} x ${item.name} @ ${item.unitPrice}`).join('\n');
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function parseLedgerItems(value: string): { items: SaleItem[]; amount: number } | null {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const items: SaleItem[] = [];
  let amount = 0;

  for (const line of lines) {
    const match = line.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(.+?)\s*@\s*(\d+(?:\.\d+)?)$/i);
    if (!match) return null;

    const qty = Number(match[1]);
    const name = match[2].trim();
    const unitPrice = Number(match[3]);
    if (!Number.isFinite(qty) || qty <= 0 || !name || !Number.isFinite(unitPrice) || unitPrice < 0) return null;

    items.push({ name, qty, unitPrice });
    amount += qty * unitPrice;
  }

  return { items, amount };
}

function getOrderFormTitle(order: Order | null): string {
  return order ? `Edit Order - ${order.code}` : `Add Order`;
}

export default function App() {
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [orderFormOrder, setOrderFormOrder] = useState<Order | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [deleteMenuItem, setDeleteMenuItem] = useState<MenuItem | null>(null);
  const [cleanDatabaseConfirmOpen, setCleanDatabaseConfirmOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editCategoryTarget, setEditCategoryTarget] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('orders');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const [menuSearch, setMenuSearch] = useState('');
  const [expandedMenuCategories, setExpandedMenuCategories] = useState<Set<string>>(new Set());
  const [addNewOpen, setAddNewOpen] = useState(false);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [drawerName, setDrawerName] = useState('');
  const [drawerHindiName, setDrawerHindiName] = useState('');
  const [drawerHindiEdited, setDrawerHindiEdited] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState('');
  const [drawerDescription, setDrawerDescription] = useState('');
  const [drawerImage, setDrawerImage] = useState('');
  const [drawerIsNonProfit, setDrawerIsNonProfit] = useState(false);
  const [drawerDisabled, setDrawerDisabled] = useState(false);
  const [drawerPrice, setDrawerPrice] = useState('');
  const [drawerAddons, setDrawerAddons] = useState<Addon[]>([]);
  // Addon drawer state
  const [addonDrawerOpen, setAddonDrawerOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<(Addon & { parentItemId: string }) | null>(null);
  const [addonDrawerDefaultParent, setAddonDrawerDefaultParent] = useState<string | undefined>(undefined);
  const [expandedAddonGroups, setExpandedAddonGroups] = useState<Set<string>>(new Set());
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState('');
  const [testingMode, setTestingModeState] = useState<boolean>(() => dbIsTesting());
  const [analyticsExperimentalEnabled, setAnalyticsExperimentalEnabledState] = useState<boolean>(() => isAnalyticsExperimentalEnabled());
  const [exportFolderPath, setExportFolderPath] = useState('');
  const [ledgerMenu, setLedgerMenu] = useState<LedgerMenuState>(null);
  const [ledgerEdit, setLedgerEdit] = useState<LedgerEditState>(null);
  const [ledgerDatePreset, setLedgerDatePreset] = useState<LedgerDatePreset>('Today');
  const [ledgerCustomDate, setLedgerCustomDate] = useState(todayISO());
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('Today');
  const [analyticsScope, setAnalyticsScope] = useState<AnalyticsScope>('All');
  const [analyticsCategory, setAnalyticsCategory] = useState<string>('All');
  const [analyticsItemId, setAnalyticsItemId] = useState<string>('All');

  const openNewOrderForm = () => {
    setOrderFormOrder(null);
    setAddOrderOpen(true);
  };

  const openEditOrderForm = (order: Order) => {
    setOrderFormOrder(order);
    setAddOrderOpen(true);
  };

  const closeOrderForm = () => {
    setAddOrderOpen(false);
    setOrderFormOrder(null);
  };

  const loadSales = useSalesStore(s => s.load);
  const loadMenu  = useMenuStore(s => s.load);
  const addMenu = useMenuStore(s => s.add);
  const removeMenu = useMenuStore(s => s.remove);
  const updateMenu = useMenuStore(s => s.update);
  const addCategory = useMenuStore(s => s.addCategory);
  const renameCategory = useMenuStore(s => s.renameCategory);
  const removeCategoryFromStore = useMenuStore(s => s.removeCategory);
  const addAddonToStore = useMenuStore(s => s.addAddon);
  const updateAddonInStore = useMenuStore(s => s.updateAddon);
  const removeAddonFromStore = useMenuStore(s => s.removeAddon);
  const menuCategories = useMenuStore(s => s.categories);
  const sales = useSalesStore(s => s.sales);
  const menuItems = useMenuStore(s => s.items);
  const todaySales = useMemo(() => sales.filter(sale => sale.date === todayISO() && sale.paymentMethod !== 'Cancelled'), [sales]);
  const yesterdaySales = useMemo(() => sales.filter(sale => sale.date === yesterdayISO() && sale.paymentMethod !== 'Cancelled'), [sales]);
  const topDishNames = useMemo(() => {
    const counts = new Map<string, number>();
    todaySales.forEach(sale => {
      sale.items.forEach(item => {
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.qty);
      });
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [todaySales]);
  const recentSales = useMemo(
    () => [...todaySales].sort((left, right) => `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`)).slice(0, 10),
    [todaySales]
  );
  const ledgerRows = sales;
  const ledgerDate = ledgerDatePreset === 'Today' ? todayISO() : ledgerDatePreset === 'Yesterday' ? yesterdayISO() : ledgerCustomDate;
  const filteredLedgerRows = useMemo(
    () => ledgerRows.filter(sale => sale.date === ledgerDate),
    [ledgerRows, ledgerDate]
  );

  // Analytics helpers
  function rangeToDates(range: AnalyticsRange) {
    let start = new Date();
    let end = new Date();
    if (range === 'Today') {
      start = new Date(); end = new Date();
    } else if (range === 'Yesterday') {
      start = new Date(); start.setDate(start.getDate() - 1); end = new Date(start);
    } else if (range === 'This Week') {
      const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      start = new Date(d.setDate(diff)); start.setHours(0,0,0,0);
      end = new Date();
    } else if (range === 'This Month') {
      const d = new Date(); start = new Date(d.getFullYear(), d.getMonth(), 1); end = new Date();
    }
    const toISO = (dt: Date) => dt.toISOString().slice(0,10);
    return { start: toISO(start), end: toISO(end) };
  }

  const analyticsData = useMemo<AnalyticsData>(() => {
    const { start, end } = rangeToDates(analyticsRange);
    // filter sales between start..end inclusive (excluding cancelled sales)
    const sel = sales.filter(s => s.date >= start && s.date <= end && s.paymentMethod !== 'Cancelled');

    // Metrics (total, orders, top items, pie) are computed from the date range only
    const totalSales = sel.reduce((acc, s) => acc + (s.amount ?? 0), 0);
    const totalOrders = sel.length;

    // Top dishes (range-only)
    const itemAgg: Record<string, { qty: number; revenue: number }> = {};
    for (const s of sel) {
      for (const it of s.items) {
        const key = it.name;
        if (!itemAgg[key]) itemAgg[key] = { qty: 0, revenue: 0 };
        itemAgg[key].qty += it.qty;
        itemAgg[key].revenue += it.qty * it.unitPrice;
      }
    }
    const topItems = Object.entries(itemAgg).map(([name, v]) => ({ name, totalQty: v.qty, totalRevenue: v.revenue }))
      .sort((a,b) => b.totalQty - a.totalQty)
      .slice(0,3);

    // Pie: category contribution (range-only)
    const catAgg: Record<string, number> = {};
    for (const s of sel) {
      for (const it of s.items) {
        const mi = menuItems.find(m => m.name === it.name);
        const cat = mi?.category ?? 'Unknown';
        catAgg[cat] = (catAgg[cat] || 0) + it.qty * it.unitPrice;
      }
    }
    const pieData = Object.entries(catAgg).map(([name, value]) => ({ name, value }));

    // Chart data: apply scope filter (All/Category/Item) only to the graph
    let chartScoped = sel;
    if (analyticsScope === 'Category' && analyticsCategory !== 'All') {
      const cat = analyticsCategory;
      chartScoped = sel.filter(s => s.items.some(it => {
        const mi = menuItems.find(m => m.name === it.name);
        return mi?.category === cat;
      }));
    } else if (analyticsScope === 'Item' && analyticsItemId !== 'All') {
      const id = analyticsItemId;
      const itemName = menuItems.find(m => m.id === id)?.name;
      if (itemName) chartScoped = sel.filter(s => s.items.some(it => it.name === itemName));
    }

    let chartData: { label: string; revenue: number; orders: number }[] = [];
    if (analyticsRange === 'Today' || analyticsRange === 'Yesterday') {
      const hours = Array.from({length:24}, (_,i) => ({ label: `${i}:00`, revenue:0, orders:0 }));
      for (const s of chartScoped) {
        const hour = Number(s.time.split(':')[0] ?? 0);
        hours[hour].revenue += s.amount;
        hours[hour].orders += 1;
      }
      chartData = hours;
    } else {
      const days: string[] = [];
      let cur = new Date(start + 'T00:00:00');
      const last = new Date(end + 'T00:00:00');
      while (cur <= last) { days.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
      chartData = days.map(d => ({ label: d, revenue: 0, orders: 0 }));
      for (const s of chartScoped) {
        const idx = chartData.findIndex(c => c.label === s.date);
        if (idx >= 0) { chartData[idx].revenue += s.amount; chartData[idx].orders += 1; }
      }
    }

    return { totalSales, totalOrders, topItems, chartData, pieData };
  }, [sales, analyticsRange, analyticsScope, analyticsCategory, analyticsItemId, menuItems]);

  // synchronous suggestions handled inline to keep UI behavior simple

  const openLedgerMenu = (event: MouseEvent<HTMLElement>, saleId: string | null) => {
    event.preventDefault();
    setLedgerMenu({ saleId, x: event.clientX, y: event.clientY });
  };
  const closeLedgerMenu = () => setLedgerMenu(null);

  const handleLedgerXlsxExport = async (filteredRows?: Sale[]) => {
    try {
      await exportSalesXLSXForDate(ledgerDate, filteredRows);
      showToast(`XLSX exported for ${ledgerDate}`, 'success');
    } catch (error) {
      console.warn('XLSX export failed', error);
      showToast('Failed to export XLSX', 'error');
    }
  };

  const handleLedgerPdfExport = async (filteredRows?: Sale[]) => {
    try {
      await exportSalesPDFForDate(ledgerDate, filteredRows);
      showToast(`PDF downloaded for ${ledgerDate}`, 'success');
    } catch (error) {
      console.warn('PDF export failed', error);
      showToast('Failed to export PDF', 'error');
    }
  };

  const chooseExportFolderPath = async () => {
    if (!isTauri()) {
      showToast('Folder picker is available in the desktop app only', 'error');
      return;
    }

    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: exportFolderPath || undefined,
        title: 'Choose export folder',
      });

      if (typeof selected !== 'string' || !selected) {
        return;
      }

      setExportFolderPath(selected);
      await setSetting(EXPORT_FOLDER_SETTING_KEY, selected);
      showToast('Save folder path updated', 'success');
    } catch (error) {
      console.warn('Failed to choose export folder path', error);
      showToast('Failed to choose folder', 'error');
    }
  };

  const refreshLedger = async () => {
    await loadSales();
  };

  const insertLedgerRow = async (
    anchorSale: Sale | null,
    direction: 'above' | 'below' | 'append',
    fallbackDate = ledgerDate
  ) => {
    const shifted = anchorSale
      ? shiftSaleDateTime(anchorSale.date, anchorSale.time, direction === 'above' ? 1 : direction === 'below' ? -1 : 0)
      : { date: fallbackDate, time: nowTime() };

    await salesService.addSale({
      date: shifted.date,
      time: shifted.time,
      items: [],
      amount: 0,
      paymentMethod: 'Cash',
    });
    await refreshLedger();
    showToast(direction === 'append' ? 'Row added' : `Row inserted ${direction}`, 'success');
  };

  const deleteLedgerRow = async (saleId: string) => {
    await salesService.deleteSale(saleId);
    await refreshLedger();
    showToast('Row deleted', 'info');
  };

  const startLedgerEdit = (sale: Sale, field: LedgerField) => {
    const value =
      field === 'date' ? sale.date :
      field === 'time' ? sale.time :
      field === 'amount' ? String(sale.amount) :
      field === 'paymentMethod' ? sale.paymentMethod :
      field === 'items' ? formatLedgerItems(sale.items) :
      sale.note ?? '';
    setLedgerEdit({ saleId: sale.id, field, value });
  };

  const cancelLedgerEdit = () => {
    setLedgerEdit(null);
  };

  const saveLedgerEdit = async () => {
    if (!ledgerEdit) return;
    const sale = sales.find(row => row.id === ledgerEdit.saleId);
    if (!sale) {
      setLedgerEdit(null);
      return;
    }

    const nextValue = ledgerEdit.value.trim();
    let updates: Partial<Omit<Sale, 'id' | 'createdAt'>> | null = null;

    if (ledgerEdit.field === 'date') {
      const parsed = new Date(`${nextValue}T00:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextValue) || Number.isNaN(parsed.getTime())) {
        showToast('Enter a valid date (YYYY-MM-DD)', 'error');
        return;
      }
      updates = { date: nextValue };
    } else if (ledgerEdit.field === 'time') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextValue)) {
        showToast('Enter a valid time (HH:MM)', 'error');
        return;
      }
      updates = { time: nextValue };
    } else if (ledgerEdit.field === 'amount') {
      const amount = Number(nextValue);
      if (!Number.isFinite(amount) || amount < 0) {
        showToast('Enter a valid non-negative amount', 'error');
        return;
      }
      updates = { amount };
    } else if (ledgerEdit.field === 'paymentMethod') {
      const allowed: PaymentMethod[] = ['Cash', 'UPI', 'Both', 'Unpaid', 'Cancelled'];
      if (!allowed.includes(nextValue as PaymentMethod)) {
        showToast('Select a valid payment method', 'error');
        return;
      }
      updates = { paymentMethod: nextValue as PaymentMethod };
    } else if (ledgerEdit.field === 'note') {
      updates = { note: nextValue || undefined };
    } else if (ledgerEdit.field === 'items') {
      const parsed = parseLedgerItems(ledgerEdit.value);
      if (!parsed) {
        showToast('Use one item per line: qty x name @ price', 'error');
        return;
      }
      updates = { items: parsed.items, amount: parsed.amount };
    }

    if (!updates) return;

    try {
      await salesService.updateSale(sale.id, updates);
      await refreshLedger();
      showToast('Row updated', 'success');
      setLedgerEdit(null);
    } catch (error) {
      console.warn('Failed to update ledger row', error);
      showToast('Failed to update row', 'error');
    }
  };

  const checkForUpdates = async (autoInstall: boolean) => {
    if (!isTauri()) {
      setUpdateStatus('unsupported');
      setUpdateNote('Updates are available only in the desktop app.');
      return;
    }

    setUpdateStatus('checking');
    setUpdateNote('Checking for updates...');

    try {
      const update = await check();
      if (!update?.available) {
        setUpdateStatus('idle');
        setUpdateVersion(null);
        setUpdateNote('You are already on the latest version.');
        return;
      }

      setUpdateStatus('available');
      setUpdateVersion(update.version ?? null);
      setUpdateNote('Update available.');

      if (autoInstall) {
        setUpdateStatus('downloading');
        setUpdateNote('Downloading update...');
        showToast('Downloading update...', 'info');
        await update.downloadAndInstall();
        setUpdateStatus('updated');
        setUpdateNote('Update installed. Restarting...');
      }
    } catch (error) {
      console.warn('Updater check failed', error);
      setUpdateStatus('error');
      setUpdateNote('Update check failed. Try again.');
    }
  };

  const installUpdate = async () => {
    await checkForUpdates(true);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await setTestingMode(testingMode);
      } catch (err) {
        console.warn('Failed to set testing mode', err);
      }
      // reload stored data from the selected DB
      if (mounted) {
        try {
          await loadSales();
          await loadMenu();
        } catch (err) {
          // ignore
        }
      }
    })();

    return () => { mounted = false; };
  }, [testingMode, loadSales, loadMenu]);

  useEffect(() => {
    const trimmed = drawerName.trim();
    if (!trimmed) {
      if (!drawerHindiEdited) {
        setDrawerHindiName('');
      }
      return;
    }

    if (drawerHindiEdited && drawerHindiName.trim() !== '') {
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      void (async () => {
        const suggestion = await suggestHindiName(trimmed);
        if (suggestion) {
          setDrawerHindiName(suggestion);
        }
      })();
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [drawerName, drawerHindiEdited, drawerHindiName]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedPath = await getSetting(EXPORT_FOLDER_SETTING_KEY);
        if (mounted && savedPath !== null) {
          setExportFolderPath(savedPath);
        }
      } catch (err) {
        console.warn('Failed to load export folder path', err);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const openMenuDrawer = (item?: MenuItem | null, category?: string) => {
    setEditingMenuItem(item ?? null);
    setDrawerName(item?.name ?? '');
    setDrawerHindiName(item?.localizedNameHi ?? '');
    setDrawerHindiEdited(Boolean(item?.localizedNameHi));
    setDrawerCategory(item?.category ?? category ?? menuCategories[0] ?? '');
    setDrawerDescription(item?.description ?? '');
    setDrawerImage(item?.image ?? '');
    setDrawerIsNonProfit(Boolean(item?.isNonProfit));
    setDrawerDisabled(item ? item.isActive === false : false);
    setDrawerPrice(item ? String(item.price) : '');
    setDrawerAddons(item?.addons ?? []);
    setAddNewOpen(false);
    setMenuDrawerOpen(true);
  };

  const closeMenuDrawer = () => {
    setMenuDrawerOpen(false);
    setEditingMenuItem(null);
    setDrawerName('');
    setDrawerHindiName('');
    setDrawerHindiEdited(false);
    setDrawerCategory('');
    setDrawerDescription('');
    setDrawerImage('');
    setDrawerIsNonProfit(false);
    setDrawerDisabled(false);
    setDrawerPrice('');
    setDrawerAddons([]);
  };

  const submitMenuDrawer = async () => {
    const trimmedName = drawerName.trim();
    const category = drawerCategory.trim();
    const primaryPrice = parseFloat(drawerPrice);
    if (!trimmedName || !category || Number.isNaN(primaryPrice)) {
      showToast('Name, category, and price are required', 'error');
      return;
    }
    const nextHindiName = drawerHindiName.trim();

    if (editingMenuItem) {
      updateMenu(editingMenuItem.id, {
        name: trimmedName,
        localizedNameHi: nextHindiName || undefined,
        category,
        price: primaryPrice,
        description: drawerDescription.trim() || undefined,
        image: drawerImage || undefined,
        isNonProfit: drawerIsNonProfit,
        isActive: !drawerDisabled,
        addons: drawerAddons.length > 0 ? drawerAddons : undefined,
      });
      showToast(`"${trimmedName}" updated`, 'success');
      closeMenuDrawer();
      return;
    }

    addMenu({
      name: trimmedName,
      localizedNameHi: nextHindiName || undefined,
      category,
      price: primaryPrice,
      description: drawerDescription.trim() || undefined,
      image: drawerImage || undefined,
      isNonProfit: drawerIsNonProfit,
      isActive: !drawerDisabled,
      addons: drawerAddons.length > 0 ? drawerAddons : undefined,
    });
    showToast(`"${trimmedName}" added`, 'success');
    closeMenuDrawer();
  };

  const handleDrawerImage = (file: File | undefined) => {
    if (!file) return;
    void (async () => {
      try {
        const compressedImage = await compressImageFile(file);
        setDrawerImage(compressedImage);
      } catch (error) {
        console.error('Failed to process menu item image', error);
        showToast('Failed to process image', 'error');
      }
    })();
  };

  const openAddonDrawer = (addon?: Addon & { parentItemId: string }, parentItemId?: string) => {
    setEditingAddon(addon ?? null);
    setAddonDrawerDefaultParent(parentItemId);
    setAddonDrawerOpen(true);
  };

  const closeAddonDrawer = () => {
    setAddonDrawerOpen(false);
    setEditingAddon(null);
    setAddonDrawerDefaultParent(undefined);
  };

  const submitAddonDrawer = (parentItemId: string, data: Omit<Addon, 'id'>) => {
    if (editingAddon) {
      // If parent changed, remove from old item, add to new
      if (editingAddon.parentItemId !== parentItemId) {
        removeAddonFromStore(editingAddon.parentItemId, editingAddon.id);
        addAddonToStore(parentItemId, data);
      } else {
        updateAddonInStore(parentItemId, editingAddon.id, data);
      }
      showToast(`"${data.name}" updated`, 'success');
    } else {
      addAddonToStore(parentItemId, data);
      showToast(`"${data.name}" add-on added`, 'success');
    }
    closeAddonDrawer();
  };

  const toggleAddonGroup = (itemId: string) => {
    setExpandedAddonGroups(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleMenuCategory = (category: string) => {
    setExpandedMenuCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const startInlineEdit = (item: MenuItem) => {
    setInlineEditingId(item.id);
    setInlineName(item.name);
  };

  const commitInlineEdit = (item: MenuItem) => {
    const trimmed = inlineName.trim();
    if (trimmed && trimmed !== item.name) {
      updateMenu(item.id, { name: trimmed });
      showToast(`"${trimmed}" renamed`, 'success');
    }
    setInlineEditingId(null);
    setInlineName('');
  };

  const confirmMenuDelete = () => {
    if (!deleteMenuItem) return;
    removeMenu(deleteMenuItem.id);
    showToast(`"${deleteMenuItem.name}" removed`, 'info');
    setDeleteMenuItem(null);
  };

  const toggleMenuActive = (item: MenuItem) => {
    const active = item.isActive !== false;
    updateMenu(item.id, { isActive: !active });
    showToast(active ? `"${item.name}" disabled` : `"${item.name}" enabled`, 'info');
  };

  const closeAddCategoryModal = () => {
    setAddCategoryOpen(false);
    setNewCategoryName('');
  };

  const closeEditCategoryModal = () => {
    setEditCategoryTarget(null);
    setEditCategoryName('');
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showToast('Enter a category name', 'error');
      return;
    }
    const exists = menuCategories.some(cat => cat.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      showToast('Category already exists', 'info');
      return;
    }
    addCategory(trimmed);
    showToast(`"${trimmed}" added`, 'success');
    closeAddCategoryModal();
  };

  const openEditCategory = (name: string) => {
    setEditCategoryTarget(name);
    setEditCategoryName(name);
  };

  const handleRenameCategory = async () => {
    if (!editCategoryTarget) return;
    const trimmed = editCategoryName.trim();
    if (!trimmed) { showToast('Enter a category name', 'error'); return; }
    if (trimmed === editCategoryTarget) { closeEditCategoryModal(); return; }
    try {
      await renameCategory(editCategoryTarget, trimmed);
      showToast(`"${editCategoryTarget}" renamed to "${trimmed}"`, 'success');
      closeEditCategoryModal();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Rename failed', 'error');
    }
  };

  const handleDeleteCategory = () => {
    if (!deleteCategoryTarget) return;
    const count = menuItems.filter(i => i.category === deleteCategoryTarget).length;
    removeCategoryFromStore(deleteCategoryTarget);
    showToast(`"${deleteCategoryTarget}" and ${count} item${count !== 1 ? 's' : ''} removed`, 'info');
    setDeleteCategoryTarget(null);
  };

  const handleCleanDatabase = async () => {
    try {
      await clearCurrentDatabase();
      showToast(testingMode ? 'Testing DB cleaned' : 'Main DB cleaned', 'info');
    } catch (err) {
      showToast('Failed to clean current DB', 'error');
    }

    setCleanDatabaseConfirmOpen(false);
    await loadSales();
    await loadMenu();
  };

  const inventoryCategories = useMemo(() => {
    const seen = new Set<string>();
    const next: string[] = [];
    [...menuCategories, ...menuItems.map(item => item.category)].forEach(category => {
      const trimmed = category.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      next.push(trimmed);
    });
    return next;
  }, [menuCategories, menuItems]);

  const filteredMenuItems = useMemo(() => {
    const term = menuSearch.trim().toLowerCase();
    if (!term) return menuItems;
    return menuItems.filter(item =>
      item.name.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    );
  }, [menuItems, menuSearch]);

  const menuGroups = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    inventoryCategories.forEach(cat => groups.set(cat, []));
    filteredMenuItems.forEach(item => {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category)?.push(item);
    });
    return groups;
  }, [filteredMenuItems, inventoryCategories]);

  const visibleMenuGroupCount = useMemo(
    () => Array.from(menuGroups.values()).filter(items => items.length > 0).length,
    [menuGroups]
  );

  const tabs: TabConfig[] = [
    { key: 'orders', label: 'Manage Orders', icon: 'receipt' },
    { key: 'ledger', label: 'Sales Ledger', icon: 'list' },
    // Analytics tab is experimental and can be disabled in settings
    ...(analyticsExperimentalEnabled ? [{ key: 'analytics' as TabKey, label: 'Analytics', icon: 'trophy' as const }] : []),
    { key: 'insights', label: 'Insights', icon: 'chart' },
    { key: 'inventory', label: 'Menu Items', icon: 'bowl' as const },
  ];

  // ensure we don't stay on analytics tab when it's disabled
  useEffect(() => {
    if (!analyticsExperimentalEnabled && activeTab === 'analytics') {
      setActiveTab('orders');
    }
  }, [analyticsExperimentalEnabled, activeTab]);


  return (
    <div className="app-shell">
      <AppSidebar
        tabs={tabs}
        activeTab={activeTab}
        sidebarCollapsed={sidebarCollapsed}
        updateStatus={updateStatus}
        restaurantName={APP_CONFIG.restaurantName}
        restaurantTagline={APP_CONFIG.restaurantTagline}
        mascotSrc={mascot}
        onToggleSidebar={() => setSidebarCollapsed(prev => {
          const next = !prev;
          localStorage.setItem('sidebar_collapsed', String(next));
          return next;
        })}
        onSelectTab={setActiveTab}
        onOpenUpdates={() => setActiveTab('updates')}
        onOpenSettings={() => setActiveTab('settings')}
      />

      <main className="main-content">
        <section className="page">
          {activeTab === 'orders' && (
            <ManageOrders
              onNewOrder={openNewOrderForm}
              onEditOrder={openEditOrderForm}
            />
          )}

          {activeTab === 'ledger' && (
            <LedgerTab
              ledgerRows={ledgerRows}
              filteredLedgerRows={filteredLedgerRows}
              ledgerDate={ledgerDate}
              ledgerDatePreset={ledgerDatePreset}
              ledgerCustomDate={ledgerCustomDate}
              ledgerEdit={ledgerEdit}
              ledgerMenu={ledgerMenu}
              onLedgerDatePresetChange={setLedgerDatePreset}
              onLedgerCustomDateChange={setLedgerCustomDate}
              onExportXlsx={(rows) => void handleLedgerXlsxExport(rows)}
              onExportPdf={(rows) => void handleLedgerPdfExport(rows)}
              onStartLedgerEdit={startLedgerEdit}
              onLedgerEditChange={setLedgerEdit}
              onSaveLedgerEdit={saveLedgerEdit}
              onCancelLedgerEdit={cancelLedgerEdit}
              onOpenLedgerMenu={openLedgerMenu}
              onCloseLedgerMenu={closeLedgerMenu}
              onInsertLedgerRow={insertLedgerRow}
              onDeleteLedgerRow={deleteLedgerRow}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab
              analyticsRange={analyticsRange}
              analyticsScope={analyticsScope}
              analyticsCategory={analyticsCategory}
              analyticsItemId={analyticsItemId}
              menuItems={menuItems}
              analyticsData={analyticsData}
              onAnalyticsRangeChange={setAnalyticsRange}
              onAnalyticsScopeChange={value => { setAnalyticsScope(value); setAnalyticsCategory('All'); setAnalyticsItemId('All'); }}
              onAnalyticsCategoryChange={setAnalyticsCategory}
              onAnalyticsItemChange={setAnalyticsItemId}
            />
          )}

          {activeTab === 'insights' && (
            <DashboardTab
              todaySales={todaySales}
              yesterdaySales={yesterdaySales}
              topDishNames={topDishNames}
              recentSales={recentSales}
              onViewLedger={() => setActiveTab('ledger')}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryTab
              menuItems={menuItems}
              inventoryCategories={inventoryCategories}
              visibleMenuGroupCount={visibleMenuGroupCount}
              menuSearch={menuSearch}
              addNewOpen={addNewOpen}
              menuGroups={menuGroups}
              expandedMenuCategories={expandedMenuCategories}
              expandedAddonGroups={expandedAddonGroups}
              inlineEditingId={inlineEditingId}
              inlineName={inlineName}
              onMenuSearchChange={setMenuSearch}
              onToggleAddNew={() => setAddNewOpen(prev => !prev)}
              onOpenAddCategory={() => setAddCategoryOpen(true)}
              onOpenMenuDrawer={(item, category) => openMenuDrawer(item ?? null, category)}
              onOpenAddonDrawer={openAddonDrawer}
              onToggleMenuCategory={toggleMenuCategory}
              onToggleAddonGroup={toggleAddonGroup}
              onOpenEditCategory={openEditCategory}
              onSetDeleteCategoryTarget={setDeleteCategoryTarget}
              onStartInlineEdit={startInlineEdit}
              onInlineNameChange={setInlineName}
              onCommitInlineEdit={commitInlineEdit}
              onCancelInlineEdit={() => { setInlineEditingId(null); setInlineName(''); }}
              onToggleMenuActive={toggleMenuActive}
              onSetDeleteMenuItem={setDeleteMenuItem}
              onRemoveAddon={(itemId, addonId) => removeAddonFromStore(itemId, addonId)}
            />
          )}

          {activeTab === 'updates' && (
            <UpdatesTab
              updateStatus={updateStatus}
              updateNote={updateNote}
              updateVersion={updateVersion}
              onCheckUpdates={() => void checkForUpdates(false)}
              onInstallUpdate={installUpdate}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              testingMode={testingMode}
              analyticsExperimentalEnabled={analyticsExperimentalEnabled}
              exportFolderPath={exportFolderPath}
              onToggleTestingMode={(value: boolean) => {
                setTestingModeState(value);
                void setTestingMode(value);
              }}
              onToggleAnalyticsExperimental={(value: boolean) => {
                setAnalyticsExperimentalEnabledState(value);
                void setAnalyticsExperimentalEnabled(value);
              }}
              onChooseExportFolder={() => void chooseExportFolderPath()}
              onClearExportFolder={() => {
                setExportFolderPath('');
                void setSetting(EXPORT_FOLDER_SETTING_KEY, '');
                showToast('Save folder path cleared', 'info');
              }}
              onCleanDatabase={async () => setCleanDatabaseConfirmOpen(true)}
            />
          )}
        </section>
      </main>

      <Modal
        id="add-order-modal"
        title={getOrderFormTitle(orderFormOrder)}
        isOpen={addOrderOpen}
        onClose={closeOrderForm}
      >
        {addOrderOpen && (
          <AddOrderForm
            key={orderFormOrder?.id ?? 'new-order'}
            order={orderFormOrder ?? undefined}
            onClose={closeOrderForm}
            onSaved={() => {
              if (orderFormOrder) {
                setActiveTab('orders');
              }
            }}
          />
        )}
      </Modal>

      <Modal
        id="add-category-modal"
        title="Add Category"
        isOpen={addCategoryOpen}
        onClose={closeAddCategoryModal}
        size="sm"
      >
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="new-category-name">Category Name*</label>
            <input
              id="new-category-name"
              type="text"
              className="input-field"
              placeholder="e.g. Paratha"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
          <button className="btn btn-ghost" onClick={closeAddCategoryModal}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAddCategory}>Add Category</button>
        </div>
      </Modal>

      <Modal
        id="delete-menu-modal"
        title="Delete Item"
        isOpen={!!deleteMenuItem}
        onClose={() => setDeleteMenuItem(null)}
        size="sm"
      >
        <div className="confirm-body">
          <p>Remove <strong>{deleteMenuItem?.name}</strong> from the menu?</p>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
          <button className="btn btn-ghost" onClick={() => setDeleteMenuItem(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={confirmMenuDelete}>Remove</button>
        </div>
      </Modal>

      {/* ── Edit Category modal ── */}
      <Modal
        id="edit-category-modal"
        title="Rename Category"
        isOpen={!!editCategoryTarget}
        onClose={closeEditCategoryModal}
        size="sm"
      >
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="edit-category-name">Category Name*</label>
            <input
              id="edit-category-name"
              type="text"
              className="input-field"
              value={editCategoryName}
              onChange={e => setEditCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleRenameCategory(); }}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
          <button className="btn btn-ghost" onClick={closeEditCategoryModal}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void handleRenameCategory()}>Save</button>
        </div>
      </Modal>

      {/* ── Delete Category modal ── */}
      <Modal
        id="delete-category-modal"
        title="Delete Category"
        isOpen={!!deleteCategoryTarget}
        onClose={() => setDeleteCategoryTarget(null)}
        size="sm"
      >
        <div className="confirm-body">
          <p>Remove <strong>{deleteCategoryTarget}</strong>?</p>
          <p className="muted">
            This will permanently remove all <strong>{menuItems.filter(i => i.category === deleteCategoryTarget).length} item{menuItems.filter(i => i.category === deleteCategoryTarget).length !== 1 ? 's' : ''}</strong>.
          </p>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
          <button className="btn btn-ghost" onClick={() => setDeleteCategoryTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDeleteCategory}>Delete All</button>
        </div>
      </Modal>

      <div
        className={`menu-drawer-backdrop${menuDrawerOpen ? ' open' : ''}`}
        onClick={closeMenuDrawer}
        aria-hidden={!menuDrawerOpen}
      />
      <MenuDrawer
        isOpen={menuDrawerOpen}
        editingMenuItem={editingMenuItem}
        inventoryCategories={inventoryCategories}
        drawerName={drawerName}
        drawerHindiName={drawerHindiName}
        drawerCategory={drawerCategory}
        drawerDescription={drawerDescription}
        drawerImage={drawerImage}
        drawerIsNonProfit={drawerIsNonProfit}
        drawerDisabled={drawerDisabled}
        drawerPrice={drawerPrice}
        drawerAddons={drawerAddons}
        onClose={closeMenuDrawer}
        onSubmit={submitMenuDrawer}
        onNameChange={(next: string) => {
          setDrawerName(next);
          if (!next.trim()) {
            setDrawerHindiName('');
            setDrawerHindiEdited(false);
          }
        }}
        onHindiNameChange={(value: string) => {
          setDrawerHindiName(value);
          setDrawerHindiEdited(true);
        }}
        onCategoryChange={setDrawerCategory}
        onDescriptionChange={setDrawerDescription}
        onImageFileChange={handleDrawerImage}
        onNonProfitChange={setDrawerIsNonProfit}
        onDisabledChange={setDrawerDisabled}
        onPriceChange={setDrawerPrice}
      />

      <div
        className={`menu-drawer-backdrop${addonDrawerOpen ? ' open' : ''}`}
        onClick={closeAddonDrawer}
        aria-hidden={!addonDrawerOpen}
      />
      <AddonDrawer
        isOpen={addonDrawerOpen}
        editingAddon={editingAddon}
        menuItems={menuItems}
        defaultParentItemId={addonDrawerDefaultParent}
        onClose={closeAddonDrawer}
        onSubmit={submitAddonDrawer}
      />

      <Modal
        id="clean-database-modal"
        title="Clean Current Database"
        isOpen={cleanDatabaseConfirmOpen}
        onClose={() => setCleanDatabaseConfirmOpen(false)}
        size="sm"
      >
        <div className="confirm-body">
          <p>Clean the current database?</p>
          <p className="muted">This will permanently erase the data in the current database. This cannot be undone.</p>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
          <button className="btn btn-ghost" onClick={() => setCleanDatabaseConfirmOpen(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => void handleCleanDatabase()}>Continue</button>
        </div>
      </Modal>

      <ToastContainer />
    </div>
  );
}
