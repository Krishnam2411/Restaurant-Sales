import type { MouseEvent } from 'react';
import type { PaymentMethod, Sale } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import type { LedgerDatePreset, LedgerEditState, LedgerField, LedgerMenuState } from './appTypes';

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
  onExportXlsx: () => void;
  onExportPdf: () => void;
  onStartLedgerEdit: (sale: Sale, field: LedgerField) => void;
  onLedgerEditChange: (value: LedgerEditState) => void;
  onSaveLedgerEdit: () => Promise<void>;
  onCancelLedgerEdit: () => void;
  onOpenLedgerMenu: (event: MouseEvent<HTMLElement>, saleId: string | null) => void;
  onCloseLedgerMenu: () => void;
  onInsertLedgerRow: (anchorSale: Sale | null, direction: 'above' | 'below' | 'append', fallbackDate?: string) => Promise<void>;
  onDeleteLedgerRow: (saleId: string) => Promise<void>;
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
  const allowedPaymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Both', 'Unpaid'];

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
          <button type="button" className="btn btn-ghost" onClick={() => void onExportXlsx()} title={`Export ledger XLSX for ${ledgerDate}`}>Export XLSX</button>
          <button type="button" className="btn btn-ghost" onClick={() => void onExportPdf()} title={`Export ledger PDF for ${ledgerDate}`}>Export PDF</button>
        </div>
      </div>

      <div className="table-wrap dense">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Items</th>
              <th>Payment</th>
              <th className="right">Amount</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredLedgerRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="empty-cell"
                  onContextMenu={event => onOpenLedgerMenu(event, null)}
                >
                  {ledgerRows.length === 0
                    ? 'No ledger entries yet. Right-click here to add one.'
                    : 'No ledger entries for the selected date.'}
                </td>
              </tr>
            ) : (
              filteredLedgerRows.map(sale => (
                <tr key={sale.id} className="ledger-row" onContextMenu={event => onOpenLedgerMenu(event, sale.id)}>
                  <td
                    className={`ledger-cell${ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'date' ? ' editing' : ' editable'}`}
                    onDoubleClick={() => onStartLedgerEdit(sale, 'date')}
                    title="Double-click to edit date"
                  >
                    {ledgerEdit?.saleId === sale.id && ledgerEdit.field === 'date' ? (
                      <div className="ledger-cell-editor">
                        <input
                          type="date"
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
                    ) : sale.date}
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