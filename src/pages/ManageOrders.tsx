import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Order, OrderItem, PaymentMethod, SaleItem } from '../types';
import { useOrderStore } from '../store/orderStore';
import { useSalesStore } from '../store/salesStore';
import { useMenuStore } from '../store/menuStore';
import { formatCurrency } from '../utils/currencyUtils';
import { nowTime, todayISO } from '../utils/dateUtils';
import { showToast } from '../components/shared/Toast';
import Modal from '../components/shared/Modal';
import { buildBillHtml, buildKotHtml, getLogoDataUri } from '../services/printerMiddleware';
import { previewReceipt } from '../services/printerService';
import Icon from '../components/shared/Icon';
import { useAsyncAction } from '../hooks/useAsyncAction';

interface ManageOrdersProps {
  onNewOrder: () => void;
  onEditOrder: (order: Order) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Both'];

function orderSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
    return sum + item.qty * item.unitPrice + addonTotal;
  }, 0);
}

function orderTotalWithChargesAndDiscount(order: Order): number {
  const subtotal = orderSubtotal(order.items);
  const chargesSum = (order.extraCharges ?? []).reduce((sum, c) => sum + c.amount, 0);
  return Math.max(0, subtotal + chargesSum - (order.discount ?? 0));
}

function formatOrderItemLine(item: OrderItem): string {
  return `${item.qty}x ${item.name}`;
}

export default function ManageOrders({ onNewOrder, onEditOrder }: ManageOrdersProps) {
  const orderStore = useOrderStore();
  const { orders, load } = orderStore;
  const { add: addSale } = useSalesStore();
  const { ingest: ingestSale } = useSalesStore();
  const { items: menuItems, load: loadMenu } = useMenuStore();
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [servedItems, setServedItems] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('served_items');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleServedItem = (key: string) => {
    setServedItems(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('served_items', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    load();
    loadMenu();
  }, [load, loadMenu]);

  const openOrders = useMemo(() => orders.filter(order => order.status === 'Open'), [orders]);

  const selectedOrder = useMemo(
    () => openOrders.find(order => order.id === selectedOrderId) ?? null,
    [openOrders, selectedOrderId]
  );

  useEffect(() => {
    if (!selectedOrderId || selectedOrder) return;
    setSelectedOrderId('');
  }, [selectedOrderId, selectedOrder]);

  useEffect(() => {
    if (!selectedOrder) {
      setPaymentMethod('Cash');
      setCashAmount('');
      setUpiAmount('');
      return;
    }
    const total = orderTotalWithChargesAndDiscount(selectedOrder);
    const method = selectedOrder.paymentMethod ?? 'Cash';
    const resolvedMethod = method === 'Unpaid' ? 'Cash' : method;
    setPaymentMethod(resolvedMethod);
    if (resolvedMethod === 'Cash') {
      setCashAmount(String(total));
      setUpiAmount('0');
    } else if (resolvedMethod === 'UPI') {
      setCashAmount('0');
      setUpiAmount(String(total));
    } else {
      const existingCash = selectedOrder.cashAmount ?? Math.floor(total / 2);
      const existingUpi = selectedOrder.upiAmount ?? total - existingCash;
      setCashAmount(String(existingCash));
      setUpiAmount(String(existingUpi));
    }
  }, [selectedOrder]);

  const completeAsync = useCallback(async () => {
    if (!selectedOrder) return;
    const currentTotal = orderTotalWithChargesAndDiscount(selectedOrder);
    if (currentTotal <= 0) {
      showToast('Add items before completing the order', 'error');
      return;
    }

    let nextCash: number | undefined;
    let nextUpi: number | undefined;
    if (paymentMethod === 'Cash') {
      nextCash = currentTotal;
      nextUpi = 0;
    } else if (paymentMethod === 'UPI') {
      nextCash = 0;
      nextUpi = currentTotal;
    } else {
      nextCash = Number(cashAmount);
      nextUpi = Number(upiAmount);
    }

    if (!Number.isFinite(nextCash) || !Number.isFinite(nextUpi)) {
      showToast('Enter valid split amounts', 'error');
      return;
    }

    if (Math.round((nextCash ?? 0) + (nextUpi ?? 0)) !== Math.round(currentTotal)) {
      showToast('Split payment must match the order total', 'error');
      return;
    }

    // Build sale data BEFORE calling complete so it's part of the atomic transaction
    const saleItems: SaleItem[] = selectedOrder.items
      .filter(item => item.countsInSales)
      .map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        addons: item.addons,
      }));

    const subtotalForSales = selectedOrder.items
      .filter(item => item.countsInSales)
      .reduce((sum, item) => {
        const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
        return sum + item.qty * item.unitPrice + addonTotal;
      }, 0);
    const saleChargesSum = (selectedOrder.extraCharges ?? []).reduce((s, c) => s + c.amount, 0);
    const saleAmount = Math.max(0, subtotalForSales + saleChargesSum - (selectedOrder.discount ?? 0));

    let saleCash: number | undefined;
    let saleUpi: number | undefined;
    if (paymentMethod === 'Cash') {
      saleCash = saleAmount;
      saleUpi = 0;
    } else if (paymentMethod === 'UPI') {
      saleCash = 0;
      saleUpi = saleAmount;
    } else {
      const cashRatio = currentTotal > 0 ? (nextCash ?? 0) / currentTotal : 0.5;
      saleCash = +(saleAmount * cashRatio).toFixed(2);
      saleUpi = +(saleAmount - saleCash).toFixed(2);
    }

    const extraSummary = selectedOrder.items
      .filter(item => !item.countsInSales)
      .map(item => `${item.qty}x ${item.name}`)
      .join(', ');

    const saleData = {
      orderCode: selectedOrder.code,
      date: todayISO(),
      time: nowTime(),
      items: saleItems,
      amount: saleAmount,
      discount: selectedOrder.discount ?? undefined,
      channel: selectedOrder.type,
      paymentMethod,
      cashAmount: saleCash,
      upiAmount: saleUpi,
      note: [selectedOrder.note?.trim() ?? '', extraSummary ? `Extras: ${extraSummary}` : ''].filter(Boolean).join(' · ') || undefined,
      extraCharges: selectedOrder.extraCharges,
    };

    // One atomic DB transaction: marks order Completed + inserts sale
    // Returns the created sale to update the UI without a re-fetch
    const sale = await useOrderStore.getState().complete(
      selectedOrder.id,
      { method: paymentMethod, cashAmount: nextCash, upiAmount: nextUpi },
      saleData
    );

    // Push the new sale directly into salesStore slices (already in DB)
    ingestSale(sale);

    // cleanup served items from localStorage
    setServedItems(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${selectedOrder.code}-`)) {
          delete next[k];
        }
      });
      localStorage.setItem('served_items', JSON.stringify(next));
      return next;
    });

    showToast('Order completed', 'success');
  }, [selectedOrder, paymentMethod, cashAmount, upiAmount, ingestSale]);

  const [handleComplete, isCompleting] = useAsyncAction(completeAsync);


  // ---------------------------------------------------------------------------
  // Preview — opens a native Tauri WebviewWindow (no modal)
  // ---------------------------------------------------------------------------

  const previewBillAsync = useCallback(async () => {
    if (!selectedOrder) return;
    const subtotal = orderSubtotal(selectedOrder.items);
    const chargesSum = (selectedOrder.extraCharges ?? []).reduce((s, c) => s + c.amount, 0);
    const total = Math.max(0, subtotal + chargesSum - (selectedOrder.discount ?? 0));
    const logoUrl = await getLogoDataUri();
    const doc = {
      kind: 'bill' as const,
      title: `Bill - ${selectedOrder.code}`,
      orderId: selectedOrder.code,
      generatedAt: new Date().toLocaleString('en-IN'),
      orderType: (selectedOrder.type === 'Dine' ? 'SERVE' : 'PACK') as 'SERVE' | 'PACK',
      customerName: selectedOrder.customerName,
      note: selectedOrder.note,
      lines: selectedOrder.items.map(item => {
        const menuItem = item.menuItemId ? menuItems.find(m => m.id === item.menuItemId) : undefined;
        const sourceName = menuItem?.name ?? item.name;
        const addonTotal = (item.addons ?? []).reduce((s, a) => s + (a.qty ?? 1) * a.price, 0);
        return {
          name: sourceName,
          hindiName: menuItem?.localizedNameHi?.trim() || sourceName,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.qty * item.unitPrice + addonTotal,
          addons: (item.addons ?? []).map(a => ({
            name: a.name,
            hindiName: a.localizedNameHi || a.name,
            price: (a.qty ?? 1) * a.price,
            qty: a.qty ?? 1,
          })),
        };
      }),
      discount: selectedOrder.discount,
      total,
      logoUrl,
      extraCharges: selectedOrder.extraCharges,
    };
    const html = buildBillHtml(doc);
    await previewReceipt(html);
  }, [selectedOrder, menuItems]);

  const previewKotAsync = useCallback(async () => {
    if (!selectedOrder) return;
    const lines = selectedOrder.items
      .map(item => {
        const printed = item.kotPrintedQty ?? 0;
        const remaining = Math.max(0, item.qty - printed);
        return { item, remaining };
      })
      .filter(({ remaining }) => remaining > 0)
      .map(({ item, remaining }) => {
        const menuItem = item.menuItemId ? menuItems.find(m => m.id === item.menuItemId) : undefined;
        const sourceName = menuItem?.name ?? item.name;
        return {
          name: sourceName,
          hindiName: menuItem?.localizedNameHi?.trim() || sourceName,
          qty: remaining,
          unitPrice: item.unitPrice,
          lineTotal: item.qty * item.unitPrice,
          addons: (item.addons ?? []).map(a => ({
            name: a.name,
            hindiName: a.localizedNameHi || a.name,
            price: (a.qty ?? 1) * a.price,
            qty: a.qty ?? 1,
          })),
        };
      });

    const doc = {
      kind: 'kot' as const,
      title: `KOT - ${selectedOrder.code}`,
      orderId: selectedOrder.code,
      generatedAt: new Date().toLocaleString('en-IN'),
      orderType: (selectedOrder.type === 'Dine' ? 'SERVE' : 'PACK') as 'SERVE' | 'PACK',
      customerName: selectedOrder.customerName,
      note: selectedOrder.note,
      lines,
    };
    const html = buildKotHtml(doc);
    await previewReceipt(html);
  }, [selectedOrder, menuItems]);

  const [handlePreviewBill, isPreviewingBill] = useAsyncAction(previewBillAsync);
  const [handlePreviewKot, isPreviewingKot] = useAsyncAction(previewKotAsync);
  const isPreviewing = isPreviewingBill || isPreviewingKot;

  const handleLayoutClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.order-card, .orders-workspace .panel, .orders-board .btn')) return;
    clearSelectedOrder();
  };

  const clearSelectedOrder = () => {
    setSelectedOrderId('');
  };

  const cancelAsync = useCallback(async () => {
    if (!selectedOrder) return;

    const saleItems: SaleItem[] = selectedOrder.items
      .filter(item => item.countsInSales)
      .map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        addons: item.addons,
      }));

    const extraSummary = selectedOrder.items
      .filter(item => !item.countsInSales)
      .map(item => `${item.qty}x ${item.name}`)
      .join(', ');

    addSale({
      orderCode: selectedOrder.code,
      date: todayISO(),
      time: nowTime(),
      items: saleItems,
      amount: 0,
      discount: selectedOrder.discount ?? undefined,
      channel: selectedOrder.type,
      paymentMethod: 'Cancelled',
      cashAmount: 0,
      upiAmount: 0,
      note: [selectedOrder.note?.trim() ?? '', extraSummary ? `Extras: ${extraSummary}` : '', 'Cancelled Order'].filter(Boolean).join(' · ') || undefined,
      extraCharges: selectedOrder.extraCharges,
    });

    // Remove order from store — it's cancelled so it leaves the live board
    await useOrderStore.getState().remove(selectedOrder.id);

    showToast('Order cancelled', 'success');
    setSelectedOrderId('');
    setCancelConfirmOpen(false);
  }, [selectedOrder, addSale]);

  const [handleCancelOrder, isCancelling] = useAsyncAction(cancelAsync);

  const canComplete = Boolean(selectedOrder && selectedOrder.items.length > 0);

  return (
    <>
      <div className="manage-orders-layout" onClick={handleLayoutClick}>
        <aside className="orders-board" onClick={event => {
          if (event.target === event.currentTarget) clearSelectedOrder();
        }}>
        <div className="panel-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>Live Orders</h2>
          </div>
          <button type="button" className="btn btn-primary" onClick={onNewOrder}>
            New Order
          </button>
        </div>

        <div className="orders-stack" onClick={event => {
          if (event.target === event.currentTarget) clearSelectedOrder();
        }}>
          {openOrders.length === 0 ? (
            <div className="orders-empty">No live orders right now.</div>
          ) : openOrders.map(order => (
            <button
              key={order.id}
              type="button"
              className={`order-card${selectedOrderId === order.id ? ' active' : ''}`}
              onClick={() => setSelectedOrderId(order.id)}
            >
              <div className="order-card-top">
                <strong>#{order.code}</strong>
                <span className="order-card-open">Click to Open</span>
              </div>
              <div className="order-card-meta">
                {order.type} - {formatCurrency(orderTotalWithChargesAndDiscount(order))}
              </div>
              {order.customerName?.trim() && (
                <div className="order-card-label">Customer/Table: {order.customerName.trim()}</div>
              )}
              {order.note?.trim() && (
                <div className="order-card-note">Note: {order.note.trim()}</div>
              )}
              <div className="order-card-items">
                {order.items.length === 0 ? (
                  <span className="text-muted">No items</span>
                ) : order.items.map((item, index) => {
                  const itemKey = `${order.code}-${item.name}-${index}`;
                  const isServed = servedItems[itemKey] || false;
                  return (
                    <span key={`${item.name}-${index}`} className="order-card-item-group">
                      <span className="order-card-item-main" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={isServed}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleServedItem(itemKey)}
                          style={{
                            cursor: 'pointer',
                            width: 14,
                            height: 14,
                            accentColor: 'var(--gold)',
                            margin: 0,
                          }}
                        />
                        <span style={{ textDecoration: isServed ? 'line-through' : 'none', opacity: isServed ? 0.6 : 1 }}>
                          {formatOrderItemLine(item)}
                        </span>
                      </span>
                      {(item.addons ?? []).map((addon, ai) => (
                        <span key={ai} className="order-card-item-addon" style={{ opacity: isServed ? 0.6 : 1 }}>
                          <span className="order-card-addon-arrow">↳</span>
                          <span>
                            {addon.price > 0 ? `+ ${addon.name}` : addon.name}
                            {(addon.qty ?? 1) > 1 ? ` ×${addon.qty}` : ''}
                          </span>
                        </span>
                      ))}
                    </span>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
        </aside>

        <section className="orders-workspace" onClick={event => {
          if (event.target === event.currentTarget) clearSelectedOrder();
        }}>
        {selectedOrder && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h4>#{selectedOrder.code}</h4>
                <p>
                  {selectedOrder.type}
                  {selectedOrder.customerName ? ` · ${selectedOrder.customerName}` : ''}
                </p>
              </div>
              <div className="modal-actions" style={{ padding: 0 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handlePreviewBill}
                  disabled={isPreviewing}
                  title="Preview bill"
                >
                  <Icon name="receipt" size={15} /> {isPreviewingBill ? 'Opening...' : 'Bill'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handlePreviewKot}
                  disabled={isPreviewing}
                  title="Preview KOT"
                >
                  <Icon name="receipt-text" size={14} /> {isPreviewingKot ? 'Opening...' : 'KOT'}
                </button>

                <button type="button" className="btn btn-ghost" onClick={() => onEditOrder(selectedOrder)} disabled={isCompleting}>
                  <Icon name="edit" size={14} /> Edit
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setCancelConfirmOpen(true)} disabled={isCompleting}>Cancel</button>
              </div>
            </div>

            {selectedOrder.note && (
              <div className="orders-empty" style={{ marginBottom: 12 }}>
                Note: {selectedOrder.note}
              </div>
            )}

            <div className="bill-lines">
              {selectedOrder.items.length === 0 ? (
                <div className="orders-empty">No items on this order yet.</div>
              ) : selectedOrder.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="bill-line">
                  <div>
                    <div className="bill-line-name">
                      {item.name}
                      {!item.countsInSales && <span className="bill-line-tag">Extra</span>}
                    </div>
                    <div className="bill-line-meta">₹{item.unitPrice.toLocaleString('en-IN')} each</div>
                    {/* Add-on child rows */}
                    {(item.addons ?? []).map((addon, ai) => (
                      <div key={ai} className="bill-line-addon">
                        <span className="bill-line-addon-arrow">↳</span>
                        <span className="bill-line-addon-name">
                          {addon.name}{(addon.qty ?? 1) > 1 ? <span style={{ opacity: 0.65, fontSize: '0.75rem', marginLeft: 3 }}>×{addon.qty}</span> : null}
                        </span>
                        {addon.price > 0
                          ? <span className="bill-line-addon-price">+{formatCurrency((addon.qty ?? 1) * addon.price)}</span>
                          : <span className="bill-line-addon-price bill-line-addon-free">free</span>
                        }
                      </div>
                    ))}
                  </div>
                  <div className="qty-controls">
                    <span className="qty-value">x{item.qty}</span>
                    <span className="text-muted" style={{ minWidth: 72, textAlign: 'right' }}>
                      ₹{(item.qty * item.unitPrice).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Simple tabular totals breakdown */}
            <div className="bill-summary-breakdown" style={{ marginTop: 16, padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.875rem', color: 'var(--muted)' }}>
                <span>Subtotal</span>
                <span>{formatCurrency(orderSubtotal(selectedOrder.items))}</span>
              </div>
              {(selectedOrder.extraCharges ?? []).map((charge, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.875rem', color: 'var(--muted)' }}>
                  <span>{charge.label}</span>
                  <span>{formatCurrency(charge.amount)}</span>
                </div>
              ))}
              {selectedOrder.discount ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.875rem', color: 'var(--tomato)' }}>
                  <span>Discount</span>
                  <span>-{formatCurrency(selectedOrder.discount)}</span>
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 12, borderTop: '1px dashed var(--border)', fontWeight: 'bold', fontSize: '1.15rem', color: 'var(--ink)' }}>
                <span>Total</span>
                <span>{formatCurrency(orderTotalWithChargesAndDiscount(selectedOrder))}</span>
              </div>
            </div>

            <div className="payment-section" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">Payment Type</label>
                <div className="payment-btns payment-btns-tight">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method}
                      type="button"
                      className={`payment-btn${paymentMethod === method ? ` selected-${method.toLowerCase()}` : ''}`}
                      onClick={() => {
                        const total = orderTotalWithChargesAndDiscount(selectedOrder);
                        setPaymentMethod(method);
                        if (method === 'Cash') {
                          setCashAmount(String(total));
                          setUpiAmount('0');
                        } else if (method === 'UPI') {
                          setCashAmount('0');
                          setUpiAmount(String(total));
                        } else {
                          const nextCash = Math.floor(total / 2);
                          const nextUpi = total - nextCash;
                          setCashAmount(String(nextCash));
                          setUpiAmount(String(nextUpi));
                        }
                      }}
                    >
                      <span className="payment-btn-label">{method}</span>
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'Both' && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Cash Amount</label>
                    <input
                      type="number"
                      className="input-field"
                      min="0"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UPI Amount</label>
                    <input
                      type="number"
                      className="input-field"
                      min="0"
                      value={upiAmount}
                      onChange={e => setUpiAmount(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="modal-actions" style={{ padding: 0, marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={handleComplete} disabled={!canComplete || isCompleting}>
                  {isCompleting ? 'Completing…' : 'Complete Order'}
                </button>
              </div>
            </div>
          </div>
        )}
        </section>
      </div>

      {/* Cancel confirmation modal — kept, unrelated to printing */}
      <Modal
        id="cancel-order-modal"
        title="Cancel Order"
        isOpen={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        size="sm"
      >
        <div className="confirm-body">
          <p className="muted"><strong>{selectedOrder?.code}</strong> will be marked as cancelled and removed from live orders.</p>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setCancelConfirmOpen(false)} disabled={isCancelling}>Close</button>
          <button type="button" className="btn btn-danger" onClick={handleCancelOrder} disabled={isCancelling}>
            {isCancelling ? 'Cancelling…' : 'Continue'}
          </button>
        </div>
      </Modal>
    </>
  );
}
