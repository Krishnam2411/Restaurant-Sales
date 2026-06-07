import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Order, OrderItem, PaymentMethod, SaleItem } from '../types';
import { useOrderStore } from '../store/orderStore';
import { useSalesStore } from '../store/salesStore';
import { useMenuStore } from '../store/menuStore';
import { formatCurrency } from '../utils/currencyUtils';
import { nowTime, todayISO } from '../utils/dateUtils';
import { showToast } from '../components/shared/Toast';
import { updateOrder as saveOrderUpdate } from '../services/orderService';
import Modal from '../components/shared/Modal';
import { buildBillHtml, buildKotHtml, getLogoDataUri } from '../services/printerMiddleware';
import { previewReceipt } from '../services/printerService';
import Icon from '../components/shared/Icon';

interface ManageOrdersProps {
  onNewOrder: () => void;
  onEditOrder: (order: Order) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Both'];

function orderSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}

function orderTotalWithDiscount(items: OrderItem[], discount?: number): number {
  const subtotal = orderSubtotal(items);
  return Math.max(0, subtotal - (discount ?? 0));
}

function formatOrderItemLine(item: OrderItem): string {
  return `${item.qty}x ${item.name}`;
}

export default function ManageOrders({ onNewOrder, onEditOrder }: ManageOrdersProps) {
  const { orders, load } = useOrderStore();
  const { add: addSale } = useSalesStore();
  const { items: menuItems, load: loadMenu } = useMenuStore();
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

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
    const total = orderTotalWithDiscount(selectedOrder.items, selectedOrder.discount ?? 0);
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

  const handleComplete = () => {
    void (async () => {
      if (!selectedOrder) return;
      const currentTotal = orderTotalWithDiscount(selectedOrder.items, selectedOrder.discount ?? 0);
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

      await saveOrderUpdate(selectedOrder.id, {
        type: selectedOrder.type,
        customerName: selectedOrder.customerName,
        items: selectedOrder.items,
        paymentMethod,
        cashAmount: nextCash,
        upiAmount: nextUpi,
        note: selectedOrder.note,
        status: 'Completed',
        completedAt: new Date().toISOString(),
      });

      const saleItems: SaleItem[] = selectedOrder.items
        .filter(item => item.countsInSales)
        .map(item => ({
          menuItemId: item.menuItemId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
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
        amount: currentTotal,
        discount: selectedOrder.discount ?? undefined,
        channel: selectedOrder.type,
        paymentMethod,
        note: [selectedOrder.note?.trim() ?? '', extraSummary ? `Extras: ${extraSummary}` : ''].filter(Boolean).join(' · ') || undefined,
      });

      showToast('Order completed', 'success');
      await load();
    })();
  };


  // ---------------------------------------------------------------------------
  // Preview — opens a native Tauri WebviewWindow (no modal)
  // ---------------------------------------------------------------------------

  const handlePreviewBill = () => {
    if (!selectedOrder) return;
    void (async () => {
      setPreviewing(true);
      try {
        const total = orderTotalWithDiscount(selectedOrder.items, selectedOrder.discount ?? 0);
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
            return {
              name: sourceName,
              hindiName: menuItem?.localizedNameHi?.trim() || sourceName,
              qty: item.qty,
              unitPrice: item.unitPrice,
              lineTotal: item.qty * item.unitPrice,
            };
          }),
          discount: selectedOrder.discount,
          total,
          logoUrl,
        };
        const html = buildBillHtml(doc, 80);
        await previewReceipt(html);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview failed';
        showToast(`Bill preview: ${message}`, 'error');
      } finally {
        setPreviewing(false);
      }
    })();
  };

  const handlePreviewKot = () => {
    if (!selectedOrder) return;
    void (async () => {
      setPreviewing(true);
      try {
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
        const html = buildKotHtml(doc, 80);
        await previewReceipt(html);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview failed';
        showToast(`KOT preview: ${message}`, 'error');
      } finally {
        setPreviewing(false);
      }
    })();
  };

  const handleLayoutClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.order-card, .orders-workspace .panel, .orders-board .btn')) return;
    clearSelectedOrder();
  };

  const clearSelectedOrder = () => {
    setSelectedOrderId('');
  };

  const handleCancelOrder = () => {
    void (async () => {
      if (!selectedOrder) return;
      await saveOrderUpdate(selectedOrder.id, {
        type: selectedOrder.type,
        customerName: selectedOrder.customerName,
        items: selectedOrder.items,
        paymentMethod: selectedOrder.paymentMethod,
        cashAmount: selectedOrder.cashAmount,
        upiAmount: selectedOrder.upiAmount,
        note: selectedOrder.note,
        status: 'Cancelled',
      });
      showToast('Order cancelled', 'success');
      setSelectedOrderId('');
      setCancelConfirmOpen(false);
      await load();
    })();
  };

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
                <strong>OrderId: {order.code}</strong>
                <span className="order-card-open">Click to Open</span>
              </div>
              <div className="order-card-meta">
                {order.type} - {formatCurrency(orderTotalWithDiscount(order.items, order.discount))}
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
                ) : order.items.map((item, index) => (
                  <span key={`${item.name}-${index}`}>{formatOrderItemLine(item)}</span>
                ))}
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
                <h4>{selectedOrder.code}</h4>
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
                  disabled={previewing}
                  title="Preview bill"
                >
                  <Icon name="receipt" size={15} /> {previewing ? 'Opening...' : 'Bill'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handlePreviewKot}
                  disabled={previewing}
                  title="Preview KOT"
                >
                  <Icon name="receipt-text" size={14} /> {previewing ? 'Opening...' : 'KOT'}
                </button>

                <button type="button" className="btn btn-ghost" onClick={() => onEditOrder(selectedOrder)}>
                  <Icon name="edit" size={14} /> Edit
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setCancelConfirmOpen(true)}>Cancel</button>
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
                        const total = orderTotalWithDiscount(selectedOrder.items, selectedOrder.discount ?? 0);
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

              <div className="modal-actions" style={{ padding: 0, marginTop: 8 }}>
                <button type="button" className="btn btn-primary" onClick={handleComplete} disabled={!canComplete}>Complete Order</button>
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
          <button type="button" className="btn btn-ghost" onClick={() => setCancelConfirmOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={handleCancelOrder}>Continue</button>
        </div>
      </Modal>
    </>
  );
}
