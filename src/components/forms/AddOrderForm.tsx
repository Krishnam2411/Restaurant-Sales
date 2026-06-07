import { useEffect, useMemo, useState } from 'react';
import type { Order, OrderItem, OrderType } from '../../types';
import { useMenuStore } from '../../store/menuStore';
import { useOrderStore } from '../../store/orderStore';
import { formatCurrency } from '../../utils/currencyUtils';
import { showToast } from '../shared/Toast';
import { addOrder as createOrder, updateOrder } from '../../services/orderService';
import Icon from '../shared/Icon';

interface Props {
  onClose: () => void;
  order?: Order;
  onSaved?: () => void;
}

const ORDER_TYPES: OrderType[] = ['Dine', 'Takeaway', 'Local Delivery', 'Zomato', 'Swiggy'];

function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
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

  useEffect(() => {
    if (!order) return;
    setOrderType(order.type);
    setCustomerName(order.customerName ?? '');
    setNote(order.note ?? '');
    setDiscount(order.discount != null ? String(order.discount) : '');
    setItems(order.items);
    setActiveCat('All');
    setSearchTerm('');
  }, [order]);

  const categories = useMemo(
    () => ['All', ...menuCategories],
    [menuCategories]
  );

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
    return Math.max(0, total - disc);
  }, [total, discount]);

  const addMenuItem = (id: string) => {
    const item = menuItems.find(menuItem => menuItem.id === id);
    if (!item) return;
    setItems(prev => {
      const next = [...prev];
      const idx = next.findIndex(existing => existing.menuItemId === id);
      if (idx >= 0) {
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
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
      } else {
        next[index] = { ...current, qty };
      }
      return next;
    });
  };

  const resetForm = () => {
    setOrderType('Dine');
    setCustomerName('');
    setNote('');
    setActiveCat('All');
    setSearchTerm('');
    setItems([]);
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      showToast('Select at least one item', 'error');
      return;
    }

    void (async () => {
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
        });
      }
      await load();
      showToast(order ? 'Order updated' : 'Order created', 'success');
      if (!order) resetForm();
      onSaved?.();
      onClose();
    })();
  };

  return (
    <div className="modal-body record-order-body">
      <div className="record-order-layout">
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

        <section className="record-order-menu">
          <div className="record-order-menu-header">
            <div>
              <h2>Available Items</h2>
            </div>
            <span className="card-badge">{menuItems.length} items</span>
          </div>

          <div className="menu-item-grid record-order-grid">
            {visibleItems.length === 0 ? (
              <div className="menu-empty">No menu items match your filter.</div>
            ) : (
              visibleItems.map(item => {
                const qty = items.find(orderItem => orderItem.menuItemId === item.id)?.qty ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`menu-item-btn${qty > 0 ? ' selected' : ''}`}
                    onClick={() => addMenuItem(item.id)}
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
                    </span>
                    {qty > 0 && <span className="menu-item-btn-qty">x{qty}</span>}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="record-order-summary">
          <div className="panel-header">
            <div>
              <h2>Order Summary</h2>
            </div>
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
            ) : items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="bill-line">
                <div>
                  <div className="bill-line-name">{item.name}</div>
                  <div className="bill-line-meta">{formatCurrency(item.unitPrice)} each</div>
                </div>
                <div className="qty-controls">
                  <button type="button" className="qty-btn" onClick={() => adjustItemQty(index, -1)}>−</button>
                  <span className="qty-value">{item.qty}</span>
                  <button type="button" className="qty-btn" onClick={() => adjustItemQty(index, 1)}>＋</button>
                  <span className="text-muted" style={{ minWidth: 60, textAlign: 'right' }}>
                    {formatCurrency(item.qty * item.unitPrice)}
                  </span>
                </div>
              </div>
            ))}
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
            <label className="form-label" htmlFor="order-discount">Discount (₹)</label>
            <input id="order-discount" type="number" className="input-field" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} />
          </div>

          <div className="modal-actions" style={{ padding: 0 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={items.length === 0}>
              {isEditing ? 'Save Changes' : 'Record Order'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
