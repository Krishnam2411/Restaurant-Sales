import { useState, useMemo, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import type { PaymentMethod, Sale } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { shortRef } from '../../utils/uuid';
import type { LedgerDatePreset, LedgerEditState, LedgerField, LedgerMenuState } from './appTypes';
import Icon from '../shared/Icon';

interface LedgerTabProps {
  ledgerRows: Sale[];
  filteredLedgerRows: Sale[];
  ledgerDate: string;
  ledgerDatePreset: LedgerDatePreset;
  ledgerCustomDate: string;
  ledgerEdit: LedgerEditState;
  ledgerMenu: LedgerMenuState;
  onLedgerDatePresetChange: (value: LedgerDatePreset) => void;
  onLedgerCustomDateChange: (value: string) => void;
  onExportXlsx: (rows: Sale[]) => void;
  onExportPdf: (rows: Sale[]) => void;
  onStartLedgerEdit: (sale: Sale, field: LedgerField) => void;
  onLedgerEditChange: (value: LedgerEditState) => void;
  onSaveLedgerEdit: () => void | Promise<void>;
  onCancelLedgerEdit: () => void;
  onOpenLedgerMenu: (event: MouseEvent<HTMLElement>, saleId: string | null) => void;
  onCloseLedgerMenu: () => void;
  onInsertLedgerRow: (anchorSale: Sale | null, direction: 'above' | 'below' | 'append', fallbackDate?: string) => void | Promise<void>;
  onDeleteLedgerRow: (saleId: string) => void | Promise<void>;
}

export default function LedgerTab({
  ledgerRows,
  filteredLedgerRows,
  ledgerDate,
  ledgerDatePreset,
  ledgerCustomDate,
  ledgerEdit,
  ledgerMenu,
  onLedgerDatePresetChange,
  onLedgerCustomDateChange,
  onExportXlsx,
  onExportPdf,
  onStartLedgerEdit,
  onLedgerEditChange,
  onSaveLedgerEdit,
  onCancelLedgerEdit,
  onOpenLedgerMenu,
  onCloseLedgerMenu,
  onInsertLedgerRow,
  onDeleteLedgerRow,
}: LedgerTabProps) {
  const allowedPaymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Both', 'Unpaid', 'Cancelled'];

  const [searchQuery, setSearchQuery] = useState('');
  const [paymentType, setPaymentType] = useState('All');
  const [timeFilter, setTimeFilter] = useState('All');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const [filterOpen, setFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Dynamic min and max sales boundaries based on filteredLedgerRows
  const { dynamicMin, dynamicMax } = useMemo(() => {
    if (filteredLedgerRows.length === 0) {
      return { dynamicMin: 0, dynamicMax: 1000 };
    }
    const amounts = filteredLedgerRows.map(sale => sale.amount ?? 0);
    const minVal = Math.min(...amounts);
    const maxVal = Math.max(...amounts);
    if (minVal === maxVal) {
      return { dynamicMin: 0, dynamicMax: maxVal === 0 ? 1000 : Math.ceil(maxVal) };
    }
    return { dynamicMin: Math.floor(minVal), dynamicMax: Math.ceil(maxVal) };
  }, [filteredLedgerRows]);

  const currentMin = minAmount === '' ? dynamicMin : parseFloat(minAmount);
  const currentMax = maxAmount === '' ? dynamicMax : parseFloat(maxAmount);

  // Reset slider selections when bounds change (e.g., date changes)
  useEffect(() => {
    setMinAmount('');
    setMaxAmount('');
  }, [dynamicMin, dynamicMax]);

  useEffect(() => {
    if (!filterOpen) return;
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  const isFilterActive = paymentType !== 'All' || timeFilter !== 'All' || minAmount || maxAmount;
  let activeFilterCount = 0;
  if (paymentType !== 'All') activeFilterCount++;
  if (timeFilter !== 'All') activeFilterCount++;
  if (minAmount || maxAmount) activeFilterCount++;

  const filteredRows = useMemo(() => {
    return filteredLedgerRows.filter(sale => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const codeMatch = sale.orderCode?.toLowerCase().includes(query);
        const noteMatch = sale.note?.toLowerCase().includes(query);
        const itemMatch = sale.items.some(item => item.name.toLowerCase().includes(query));
        const freeTextMatch = sale.freeText?.toLowerCase().includes(query);
        if (!codeMatch && !noteMatch && !itemMatch && !freeTextMatch) return false;
      }
      // 2. Payment Type
      if (paymentType !== 'All') {
        if (sale.paymentMethod !== paymentType) return false;
      }
      // 3. Amount Range
      const amt = sale.amount ?? 0;
      if (minAmount) {
        const minVal = parseFloat(minAmount);
        if (!Number.isNaN(minVal) && amt < minVal) return false;
      }
      if (maxAmount) {
        const maxVal = parseFloat(maxAmount);
        if (!Number.isNaN(maxVal) && amt > maxVal) return false;
      }
      // 4. Time
      if (timeFilter !== 'All') {
        const hour = parseInt(sale.time.split(':')[0] ?? '0', 10);
        if (timeFilter === 'Morning') {
          if (hour < 5 || hour >= 12) return false;
        } else if (timeFilter === 'Afternoon') {
          if (hour < 12 || hour >= 17) return false;
        } else if (timeFilter === 'Evening') {
          if (hour < 17 && hour >= 5) return false;
        }
      }
      return true;
    });
  }, [filteredLedgerRows, searchQuery, paymentType, minAmount, maxAmount, timeFilter]);

  return (
    <div className="panel ledger-panel">
      <div className="panel-header">
        <div>
          <h2>Sales Ledger</h2>
        </div>
        <div className="ledger-date-filter">
          <span className="ledger-date-heading">Show</span>
          <div className="ledger-date-presets">
            <button type="button" className={`ledger-date-chip${ledgerDatePreset === 'Today' ? ' active' : ''}`} onClick={() => onLedgerDatePresetChange('Today')}>Today</button>
            <button type="button" className={`ledger-date-chip${ledgerDatePreset === 'Yesterday' ? ' active' : ''}`} onClick={() => onLedgerDatePresetChange('Yesterday')}>Yesterday</button>
            <button type="button" className={`ledger-date-chip${ledgerDatePreset === 'Custom' ? ' active' : ''}`} onClick={() => onLedgerDatePresetChange('Custom')}>Custom</button>
          </div>
          {ledgerDatePreset === 'Custom' && (
            <div className="ledger-date-custom">
              <label className="ledger-date-label" htmlFor="ledger-custom-date">Date</label>
              <input
                id="ledger-custom-date"
                type="date"
                className="input-field ledger-date-input"
                value={ledgerCustomDate}
                onChange={e => {
                  onLedgerDatePresetChange('Custom');
                  onLedgerCustomDateChange(e.target.value);
                }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost" onClick={() => void onExportXlsx(filteredRows)} title={`Export ledger XLSX for ${ledgerDate}`}>Export XLSX</button>
          <button type="button" className="btn btn-ghost" onClick={() => void onExportPdf(filteredRows)} title={`Export ledger PDF for ${ledgerDate}`}>Export PDF</button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="ledger-search-row">
        {/* Search Input */}
        <div className="ledger-search-input-wrap">
          <Icon name="search" size={16} className="ledger-search-icon" />
          <input
            id="ledger-search"
            type="text"
            className="input-field ledger-search-field"
            placeholder="Search code, items, notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter button and dropdown container */}
        <div className="ledger-filter-container" ref={filterDropdownRef}>
          <button
            type="button"
            className={`btn btn-ghost ledger-filter-btn${isFilterActive ? ' active' : ''}`}
            onClick={() => setFilterOpen(prev => !prev)}
          >
            <Icon name="filter" size={15} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="filter-badge">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* E-commerce style Filter Dropdown Panel */}
          {filterOpen && (
            <div className="ledger-filter-dropdown">
              <div className="ledger-filter-dropdown-header">
                <h4>Filter Options</h4>
                {isFilterActive && (
                  <button
                    type="button"
                    className="ledger-clear-btn"
                    onClick={() => {
                      setPaymentType('All');
                      setTimeFilter('All');
                      setMinAmount('');
                      setMaxAmount('');
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Payment Type */}
              <div className="ledger-filter-group">
                <label className="form-label" htmlFor="ledger-payment-type">Payment Type</label>
                <select
                  id="ledger-payment-type"
                  className="input-field"
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value)}
                >
                  <option value="All">All Payments</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Both">Both</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Time Category */}
              <div className="ledger-filter-group">
                <label className="form-label" htmlFor="ledger-time-category">Time Category</label>
                <select
                  id="ledger-time-category"
                  className="input-field"
                  value={timeFilter}
                  onChange={e => setTimeFilter(e.target.value)}
                >
                  <option value="All">All Times</option>
                  <option value="Morning">Morning (5am - 12pm)</option>
                  <option value="Afternoon">Afternoon (12pm - 5pm)</option>
                  <option value="Evening">Evening (5pm - 5am)</option>
                </select>
              </div>

              {/* Amount Range */}
              <div className="ledger-filter-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Amount Range</label>
                  <span className="ledger-range-text" style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--brown-dark)' }}>
                    ₹{currentMin} - ₹{currentMax}
                  </span>
                </div>
                <div className="dual-range-slider-container">
                  <div className="slider-track" />
                  <div
                    className="slider-range"
                    style={{
                      left: `${((currentMin - dynamicMin) / (dynamicMax - dynamicMin || 1)) * 100}%`,
                      width: `${((currentMax - currentMin) / (dynamicMax - dynamicMin || 1)) * 100}%`,
                    }}
                  />
                  <input
                    type="range"
                    min={dynamicMin}
                    max={dynamicMax}
                    value={currentMin}
                    onChange={e => {
                      const val = Math.min(Number(e.target.value), currentMax);
                      setMinAmount(String(val));
                    }}
                    style={{
                      zIndex: currentMin > dynamicMax - (dynamicMax - dynamicMin) * 0.1 ? 5 : 3
                    }}
                    className="thumb thumb-left"
                  />
                  <input
                    type="range"
                    min={dynamicMin}
                    max={dynamicMax}
                    value={currentMax}
                    onChange={e => {
                      const val = Math.max(Number(e.target.value), currentMin);
                      setMaxAmount(String(val));
                    }}
                    style={{
                      zIndex: currentMax < dynamicMin + (dynamicMax - dynamicMin) * 0.1 ? 5 : 4
                    }}
                    className="thumb thumb-right"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap dense">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Time</th>
              <th>Items</th>
              <th>Payment</th>
              <th className="right">Amount</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="empty-cell"
                  onContextMenu={event => onOpenLedgerMenu(event, null)}
                >
                  {filteredLedgerRows.length === 0
                    ? (ledgerRows.length === 0
                      ? 'No ledger entries yet. Right-click here to add one.'
                      : 'No ledger entries for the selected date.')
                    : 'No ledger entries match the active filters.'}
                </td>
              </tr>
            ) : (
              filteredRows.map(sale => (
                <tr key={sale.id} className="ledger-row" onContextMenu={event => onOpenLedgerMenu(event, sale.id)}>
                  <td className="ledger-cell" title={sale.date}>
                    {sale.orderCode
                      ? <span>{sale.orderCode}</span>
                      : <span>#{shortRef(sale.id)}</span>
                    }
                  </td>
                  <td
                    className={`ledger-cell${ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'time' ? ' editing' : ' editable'}`}
                    onDoubleClick={() => onStartLedgerEdit(sale, 'time')}
                    title="Double-click to edit time"
                  >
                    {ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'time' ? (
                      <div className="ledger-cell-editor">
                        <input
                          type="time"
                          className="input-field ledger-inline-field"
                          value={ledgerEdit.value}
                          autoFocus
                          onChange={event => onLedgerEditChange({ ...ledgerEdit, value: event.target.value })}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void onSaveLedgerEdit();
                            if (event.key === 'Escape') onCancelLedgerEdit();
                          }}
                        />
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void onSaveLedgerEdit()}>Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLedgerEdit}>Cancel</button>
                      </div>
                    ) : sale.time}
                  </td>
                  <td
                    className={`ledger-cell${ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'items' ? ' editing' : ' editable'}`}
                    onDoubleClick={() => onStartLedgerEdit(sale, 'items')}
                    title="Double-click to edit items"
                  >
                    {ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'items' ? (
                      <div className="ledger-cell-editor ledger-items-editor">
                        <textarea
                          className="input-field ledger-inline-field ledger-inline-textarea"
                          value={ledgerEdit.value}
                          autoFocus
                          onChange={event => onLedgerEditChange({ ...ledgerEdit, value: event.target.value })}
                          onKeyDown={event => {
                            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void onSaveLedgerEdit();
                            if (event.key === 'Escape') onCancelLedgerEdit();
                          }}
                        />
                        <div className="ledger-inline-actions">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => void onSaveLedgerEdit()}>Save</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLedgerEdit}>Cancel</button>
                        </div>
                        <div className="ledger-inline-hint">One item per line: qty x name @ price</div>
                      </div>
                    ) : (
                      <span className="muted">{sale.items.map(item => `${item.qty}x ${item.name}`).join(', ') || sale.freeText || 'Manual entry'}</span>
                    )}
                  </td>
                  <td
                    className={`ledger-cell${ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'paymentMethod' ? ' editing' : ' editable'}`}
                    onDoubleClick={() => onStartLedgerEdit(sale, 'paymentMethod')}
                    title="Double-click to edit payment method"
                  >
                    {ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'paymentMethod' ? (
                      <div className="ledger-cell-editor">
                        <select
                          className="input-field ledger-inline-field"
                          value={ledgerEdit.value}
                          autoFocus
                          onChange={event => onLedgerEditChange({ ...ledgerEdit, value: event.target.value })}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void onSaveLedgerEdit();
                            if (event.key === 'Escape') onCancelLedgerEdit();
                          }}
                        >
                          {allowedPaymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void onSaveLedgerEdit()}>Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLedgerEdit}>Cancel</button>
                      </div>
                    ) : (
                      <span className={`pill ${sale.paymentMethod.toLowerCase()}`}>{sale.paymentMethod}</span>
                    )}
                  </td>
                  <td
                    className={`right ledger-cell${ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'amount' ? ' editing' : ' editable'}`}
                    onDoubleClick={() => onStartLedgerEdit(sale, 'amount')}
                    title="Double-click to edit amount"
                  >
                    {ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'amount' ? (
                      <div className="ledger-cell-editor ledger-cell-editor-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-field ledger-inline-field ledger-inline-field-right"
                          value={ledgerEdit.value}
                          autoFocus
                          onChange={event => onLedgerEditChange({ ...ledgerEdit, value: event.target.value })}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void onSaveLedgerEdit();
                            if (event.key === 'Escape') onCancelLedgerEdit();
                          }}
                        />
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void onSaveLedgerEdit()}>Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLedgerEdit}>Cancel</button>
                      </div>
                    ) : formatCurrency(sale.amount)}
                  </td>
                  <td
                    className={`ledger-cell${ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'note' ? ' editing' : ' editable'}`}
                    onDoubleClick={() => onStartLedgerEdit(sale, 'note')}
                    title="Double-click to edit note"
                  >
                    {ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'note' ? (
                      <div className="ledger-cell-editor">
                        <input
                          type="text"
                          className="input-field ledger-inline-field"
                          value={ledgerEdit.value}
                          autoFocus
                          onChange={event => onLedgerEditChange({ ...ledgerEdit, value: event.target.value })}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void onSaveLedgerEdit();
                            if (event.key === 'Escape') onCancelLedgerEdit();
                          }}
                        />
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void onSaveLedgerEdit()}>Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLedgerEdit}>Cancel</button>
                      </div>
                    ) : (
                      <span className="muted">{sale.note || '—'}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {ledgerMenu && (
        <>
          <div className="ledger-menu-backdrop" onClick={onCloseLedgerMenu} />
          <div
            className="ledger-context-menu"
            style={{ top: ledgerMenu.y, left: ledgerMenu.x }}
            onClick={event => event.stopPropagation()}
          >
            {ledgerMenu.saleId === null ? (
              <button
                type="button"
                onClick={async () => {
                  onCloseLedgerMenu();
                  await onInsertLedgerRow(null, 'append', ledgerDate);
                }}
              >
                Add row
              </button>
            ) : (
              (() => {
                const sale = filteredLedgerRows.find(row => row.id === ledgerMenu.saleId) ?? null;

                return (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        onCloseLedgerMenu();
                        await onInsertLedgerRow(sale, 'above');
                      }}
                    >
                      Insert row above
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        onCloseLedgerMenu();
                        await onInsertLedgerRow(sale, 'below');
                      }}
                    >
                      Insert row below
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={async () => {
                        const saleId = ledgerMenu.saleId;
                        if (!saleId) return;
                        onCloseLedgerMenu();
                        await onDeleteLedgerRow(saleId);
                      }}
                    >
                      Delete row
                    </button>
                  </>
                );
              })()
            )}
          </div>
        </>
      )}
    </div>
  );
}