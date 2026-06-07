import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';

interface DashboardTabProps {
  todaySales: Sale[];
  yesterdaySales: Sale[];
  topDishNames: string[];
  recentSales: Sale[];
  onViewLedger: () => void;
}

export default function DashboardTab({
  todaySales,
  yesterdaySales,
  topDishNames,
  recentSales,
  onViewLedger,
}: DashboardTabProps) {
  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Today's Sales</div>
          <div className="kpi-value">{todaySales.length ? formatCurrency(todaySales.reduce((sum, sale) => sum + sale.amount, 0)) : '-'}</div>
        </div>
        <div className="kpi-card soft">
          <div className="kpi-label">Yesterday's Sales</div>
          <div className="kpi-value">{yesterdaySales.length ? formatCurrency(yesterdaySales.reduce((sum, sale) => sum + sale.amount, 0)) : '-'}</div>
        </div>
        <div className="kpi-card accent">
          <div className="kpi-label">Most Sold Dishes</div>
          <div className="kpi-value">{topDishNames.length ? topDishNames.join(', ') : '-'}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent Orders</h2>
          </div>
          <button className="btn btn-ghost" onClick={onViewLedger}>View Ledger</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Time</th>
                <th>Items</th>
                <th>Payment</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-cell">No sales yet. Record your first order.</td>
                </tr>
              ) : (
                recentSales.map(sale => (
                  <tr key={sale.id}>
                    <td>#{sale.id.slice(-5).toUpperCase()}</td>
                    <td>{sale.time}</td>
                    <td className="muted">{sale.items.map(item => `${item.qty}x ${item.name}`).join(', ') || 'Manual entry'}</td>
                    <td><span className={`pill ${sale.paymentMethod.toLowerCase()}`}>{sale.paymentMethod}</span></td>
                    <td className="right">{formatCurrency(sale.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}