import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Order, OrderItem, OrderItemAddon, OrderType, ExtraCharge } from '../../types';
import { useMenuStore } from '../../store/menuStore';
import { useOrderStore } from '../../store/orderStore';
import { formatCurrency } from '../../utils/currencyUtils';
import { showToast } from '../shared/Toast';
import { addOrder as createOrder, updateOrder } from '../../services/orderService';
import Icon from '../shared/Icon';
import { useAsyncAction } from '../../hooks/useAsyncAction';

interface Props {
  onClose: () => void;
  order?: Order;
  onSaved?: () => void;
}

const ORDER_TYPES: OrderType[] = ['Dine', 'Takeaway', 'Local Delivery', 'Zomato', 'Swiggy'];

function itemLineTotal(item: OrderItem): number {
  const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
  return item.qty * item.unitPrice + addonTotal;
}

function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + itemLineTotal(item), 0);
}

export default function AddOrderForm({ onClose, order, onSaved }: Props) {
  const { items: menuItems, categories: menuCategories } = useMenuStore();
  const { load } = useOrderStore();
  const isEditing = Boolean(order);

  const [orderType, setOrderType] = useState<OrderType>('Dine');
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState<string>(order?.discount != null ? String(order.discount) : '');
  const [activeCat, setActiveCat] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>(order?.extraCharges ?? []);
  const [newChargeLabel, setNewChargeLabel] = useState('');
  const [newChargeAmount, setNewChargeAmount] = useState('');

  // which bill-line index has its addon picker open
  const [addonPickerForIndex, setAddonPickerForIndex] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!order) return;
    setOrderType(order.type);
    setCustomerName(order.customerName ?? '');
    setNote(order.note ?? '');
    setDiscount(order.discount != null ? String(order.discount) : '');
    setExtraCharges(order.extraCharges ?? []);
    // Ensure legacy addons without qty get qty: 1
    setItems(order.items.map(item => ({
      ...item,
      addons: item.addons?.map(a => ({ ...a, qty: a.qty ?? 1 })),
    })));
    setActiveCat('All');
    setSearchTerm('');
    setAddonPickerForIndex(null);
  }, [order]);

  // Close picker when clicking outside
  useEffect(() => {
    if (addonPickerForIndex === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setAddonPickerForIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addonPickerForIndex]);

  const categories = useMemo(() => ['All', ...menuCategories], [menuCategories]);

  const visibleItems = useMemo(() => {
    const activeItems = menuItems.filter(item => item.isActive !== false);
    const term = searchTerm.trim().toLowerCase();
    return activeItems.filter(item => {
      if (activeCat !== 'All' && item.category !== activeCat) return false;
      if (term && !item.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [menuItems, activeCat, searchTerm]);

  const total = useMemo(() => orderTotal(items), [items]);
  const finalTotal = useMemo(() => {
    const disc = discount ? parseFloat(discount) || 0 : 0;
    const chargesSum = extraCharges.reduce((s, c) => s + c.amount, 0);
    return Math.max(0, total + chargesSum - disc);
  }, [total, discount, extraCharges]);

  // ── Cart helpers ─────────────────────────────────────

  const commitMenuItem = (id: string) => {
    const item = menuItems.find(mi => mi.id === id);
    if (!item) return;
    setItems(prev => {
      const next = [...prev];
      const existingIdx = next.findIndex(
        e => e.menuItemId === id && (e.addons ?? []).length === 0
      );
      if (existingIdx >= 0) {
        next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + 1 };
      } else {
        next.push({
          menuItemId: id,
          name: item.name,
          qty: 1,
          unitPrice: item.price,
          countsInSales: !item.isNonProfit,
        });
      }
      return next;
    });
  };

  const adjustItemQty = (index: number, delta: number) => {
    setItems(prev => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const qty = current.qty + delta;
      if (qty <= 0) {
        next.splice(index, 1);
        setAddonPickerForIndex(null);
      } else {
        next[index] = { ...current, qty };
      }
      return next;
    });
  };

  // Add a new add-on to a bill-line (qty starts at 1)
  const addAddonToLine = (lineIndex: number, addon: Omit<OrderItemAddon, 'qty'>) => {
    setItems(prev => {
      const next = [...prev];
      const line = next[lineIndex];
      if (!line) return prev;
      const existing = line.addons ?? [];
      if (existing.some(a => a.addonId === addon.addonId)) return prev; // already added
      next[lineIndex] = { ...line, addons: [...existing, { ...addon, qty: 1 }] };
      return next;
    });
    setAddonPickerForIndex(null);
  };

  // Adjust qty of an existing add-on; remove when qty hits 0
  const adjustAddonQty = (lineIndex: number, addonId: string, delta: number) => {
    setItems(prev => {
      const next = [...prev];
      const line = next[lineIndex];
      if (!line) return prev;
      const addons = (line.addons ?? [])
        .map(a => a.addonId === addonId ? { ...a, qty: (a.qty ?? 1) + delta } : a)
        .filter(a => a.qty > 0);
      next[lineIndex] = { ...line, addons: addons.length > 0 ? addons : undefined };
      return next;
    });
  };

  const resetForm = () => {
    setOrderType('Dine');
    setCustomerName('');
    setNote('');
    setDiscount('');
    setExtraCharges([]);
    setNewChargeLabel('');
    setNewChargeAmount('');
    setActiveCat('All');
    setSearchTerm('');
    setItems([]);
    setAddonPickerForIndex(null);
  };

  const submitAsync = useCallback(async () => {
    if (items.length === 0) {
      showToast('Select at least one item', 'error');
      return;
    }
    if (order) {
      await updateOrder(order.id, {
        type: orderType,
        customerName: customerName.trim() || undefined,
        items,
        paymentMethod: order.paymentMethod ?? 'Unpaid',
        discount: discount ? parseFloat(discount) || 0 : undefined,
        note: note.trim() || undefined,
        status: order.status,
        cashAmount: order.cashAmount,
        upiAmount: order.upiAmount,
        completedAt: order.completedAt,
        extraCharges: extraCharges.length > 0 ? extraCharges : undefined,
      });
    } else {
      await createOrder({
        type: orderType,
        customerName: customerName.trim() || undefined,
        items,
        paymentMethod: 'Unpaid',
        discount: discount ? parseFloat(discount) || 0 : undefined,
        note: note.trim() || undefined,
        status: 'Open',
        extraCharges: extraCharges.length > 0 ? extraCharges : undefined,
      });
    }
    await load();
    showToast(order ? 'Order updated' : 'Order created', 'success');
    if (!order) resetForm();
    onSaved?.();
    onClose();
  }, [order, orderType, customerName, items, discount, note, extraCharges, load, onSaved, onClose]);

  const [handleSubmit, isSaving] = useAsyncAction(submitAsync);

  return (
    <div className="modal-body record-order-body">
      <div className="record-order-layout">
        {/* ── Left: category filter ── */}
        <aside className="record-order-sidebar">
          <div className="record-order-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              className="input-field"
              placeholder="Search item"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="record-order-categories">
            {categories.map(category => (
              <button
                key={category}
                type="button"
                className={`category-tab${activeCat === category ? ' active' : ''}`}
                onClick={() => setActiveCat(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Centre: menu grid ── */}
        <section className="record-order-menu">
          <div className="record-order-menu-header">
            <div><h2>Available Items</h2></div>
            <span className="card-badge">{menuItems.length} items</span>
          </div>
          <div className="menu-item-grid record-order-grid">
            {visibleItems.length === 0 ? (
              <div className="menu-empty">No menu items match your filter.</div>
            ) : visibleItems.map(item => {
              const cartQty = items.filter(oi => oi.menuItemId === item.id).reduce((s, oi) => s + oi.qty, 0);
              const hasAddons = (item.addons ?? []).length > 0;
              return (
                <div key={item.id} className="menu-item-btn-wrap">
                  <button
                    type="button"
                    className={`menu-item-btn${cartQty > 0 ? ' selected' : ''}`}
                    onClick={() => commitMenuItem(item.id)}
                  >
                    <span className="menu-item-btn-thumb" aria-hidden="true">
                      {item.image ? (
                        <img src={item.image} alt="" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 122.88">
                          <path fill="#7A4B1F" d="M61.44,0A61.46,61.46,0,1,1,18,18,61.21,61.21,0,0,1,61.44,0ZM52.55,58.42c2.92-2,4.39-4.61,4.14-10.58V32.49c0-2.14-3.92-2.4-4.11,0l-.15,12.45a1.75,1.75,0,1,1-3.5,0l.15-12.88c0-2.3-3.77-2.53-3.81,0,0,3.58-.15,9.31-.15,12.88a1.52,1.52,0,1,1-3,0l.15-12.79A2.09,2.09,0,0,0,39,30.61c-1.38.88-1.1,2.65-1.16,4.15l-.48,14.69c.07,4.27,1.19,7.74,4.54,9.22a8.37,8.37,0,0,0,2,.52L42.77,89.25a3.76,3.76,0,0,0,3.71,3.86h.46a4.24,4.24,0,0,0,4.17-4.34l-1-29.59a6.61,6.61,0,0,0,2.45-.76Zm18,29.75-.05-26.41c-11.29-6.52-7.69-31.64,3.6-31.5,13.72.16,15.35,28.31,3.55,31.4l.87,26.64c.17,6.13-8,6.7-8-.13ZM99.29,23.59A53.52,53.52,0,1,0,115,61.44,53.36,53.36,0,0,0,99.29,23.59Z"/>
                        </svg>
                      )}
                    </span>
                    <span className="menu-item-btn-copy">
                      <span className="menu-item-btn-row">
                        <span className="menu-item-btn-name">{item.name}</span>
                        <span className="menu-item-btn-price">{formatCurrency(item.price)}</span>
                      </span>
                      {hasAddons && <span className="menu-item-btn-addons-hint">+ add-ons available</span>}
                    </span>
                    {cartQty > 0 && <span className="menu-item-btn-qty">x{cartQty}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Right: order summary ── */}
        <aside className="record-order-summary">
          <div className="panel-header">
            <div><h2>Order Summary</h2></div>
          </div>

          <div className="form-group">
            <label className="form-label">Type*</label>
            <div className="type-chip-row">
              {ORDER_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  className={`category-tab${orderType === type ? ' active' : ''}`}
                  onClick={() => setOrderType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="bill-lines">
            {items.length === 0 ? (
              <div className="orders-empty">No items selected yet.</div>
            ) : items.map((item, index) => {
              const menuItem = item.menuItemId ? menuItems.find(mi => mi.id === item.menuItemId) : undefined;
              const availableAddons = menuItem?.addons ?? [];
              const addedAddonIds = new Set((item.addons ?? []).map(a => a.addonId));
              // Add-ons that haven't been added to this line yet
              const remainingAddons = availableAddons.filter(a => !addedAddonIds.has(a.id));
              const pickerOpen = addonPickerForIndex === index;

              return (
                <div key={`${item.menuItemId ?? item.name}-${index}`} className="bill-line bill-line-with-addons">
                  {/* Item name + addons section */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bill-line-name">{item.name}</div>
                    <div className="bill-line-meta">{formatCurrency(item.unitPrice)} each</div>

                    {/* Add-on child rows with qty controls */}
                    {(item.addons ?? []).map((addon) => (
                      <div key={addon.addonId} className="bill-line-addon bill-line-addon-interactive">
                        <span className="bill-line-addon-arrow">↳</span>
                        <span className="bill-line-addon-name">{addon.name}</span>
                        {/* Qty controls for add-on */}
                        <div className="addon-qty-controls">
                          <button
                            type="button"
                            className="addon-qty-btn"
                            onClick={() => adjustAddonQty(index, addon.addonId, -1)}
                            title="Decrease"
                          >
                            −
                          </button>
                          <span className="addon-qty-value">{addon.qty ?? 1}</span>
                          <button
                            type="button"
                            className="addon-qty-btn"
                            onClick={() => adjustAddonQty(index, addon.addonId, 1)}
                            title="Increase"
                          >
                            ＋
                          </button>
                        </div>
                        {addon.price > 0
                          ? <span className="bill-line-addon-price">+{formatCurrency(addon.price * (addon.qty ?? 1))}</span>
                          : <span className="bill-line-addon-price bill-line-addon-free">free</span>
                        }
                      </div>
                    ))}

                    {/* "+ Add add-on" — only shown when there are still add-ons left to add */}
                    {remainingAddons.length > 0 && (
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className="bill-addon-trigger"
                          onClick={() => setAddonPickerForIndex(pickerOpen ? null : index)}
                        >
                          <span className="bill-addon-trigger-icon">＋</span>
                          Add add-on
                        </button>

                        {pickerOpen && (
                          <div className="bill-addon-picker" ref={pickerRef}>
                            <div className="addon-picker-title">Choose add-on</div>
                            <div className="addon-picker-list">
                              {remainingAddons.map(addon => (
                                <button
                                  key={addon.id}
                                  type="button"
                                  className="addon-chip"
                                  onClick={() => addAddonToLine(index, {
                                    addonId: addon.id,
                                    name: addon.name,
                                    localizedNameHi: addon.localizedNameHi,
                                    price: addon.price,
                                  })}
                                >
                                  <span>{addon.name}</span>
                                  {addon.price > 0
                                    ? <span className="addon-chip-price">+{formatCurrency(addon.price)}</span>
                                    : <span className="addon-chip-price" style={{ opacity: 0.5 }}>free</span>
                                  }
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Item qty controls */}
                  <div className="qty-controls">
                    <button type="button" className="qty-btn" onClick={() => adjustItemQty(index, -1)}>−</button>
                    <span className="qty-value">{item.qty}</span>
                    <button type="button" className="qty-btn" onClick={() => adjustItemQty(index, 1)}>＋</button>
                    <span className="text-muted" style={{ minWidth: 60, textAlign: 'right' }}>
                      {formatCurrency(itemLineTotal(item))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="order-total-strip">
            <span className="order-total-label">{items.length > 0 ? `${items.length} items` : 'Total'}</span>
            <span className="order-total-value">{formatCurrency(finalTotal)}</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="order-customer">Customer / Table</label>
            <input
              id="order-customer"
              type="text"
              className="input-field"
              placeholder="Table 1/2/3/4, Guest name..."
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="order-note">Note</label>
            <input
              id="order-note"
              type="text"
              className="input-field"
              placeholder="Special request or order note"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Extra Charges (₹)</label>
            {extraCharges.map((charge, idx) => (
              <div key={idx} className="extra-charge-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.85rem', flex: 1, color: 'var(--text-color)' }}>{charge.label}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(charge.amount)}</span>
                <button
                  type="button"
                  className="addon-qty-btn"
                  style={{ color: 'var(--danger-color)', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  onClick={() => {
                    setExtraCharges(prev => prev.filter((_, i) => i !== idx));
                  }}
                  title="Remove charge"
                >
                  ✕
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Packaging"
                style={{ flex: 2 }}
                value={newChargeLabel}
                onChange={e => setNewChargeLabel(e.target.value)}
              />
              <input
                type="number"
                className="input-field"
                placeholder="Amt"
                style={{ flex: 1 }}
                min="0"
                step="0.01"
                value={newChargeAmount}
                onChange={e => setNewChargeAmount(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0 10px', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => {
                  const val = parseFloat(newChargeAmount);
                  const lbl = newChargeLabel.trim();
                  if (lbl && !Number.isNaN(val) && val > 0) {
                    setExtraCharges(prev => [...prev, { label: lbl, amount: val }]);
                    setNewChargeLabel('');
                    setNewChargeAmount('');
                  }
                }}
              >
                ＋
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="order-discount">Discount (₹)</label>
            <input id="order-discount" type="number" className="input-field" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} />
          </div>

          <div className="modal-actions" style={{ padding: 0 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={items.length === 0 || isSaving}>
              {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Record Order'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
