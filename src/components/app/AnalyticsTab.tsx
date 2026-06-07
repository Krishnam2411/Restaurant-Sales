import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { AnalyticsData, AnalyticsRange, AnalyticsScope } from './appTypes';
import type { MenuItem } from '../../types';
import WeeklyBarChart from '../charts/WeeklyBarChart';
import { formatCurrency } from '../../utils/currencyUtils';

interface AnalyticsTabProps {
  analyticsRange: AnalyticsRange;
  analyticsScope: AnalyticsScope;
  analyticsCategory: string;
  analyticsItemId: string;
  menuItems: MenuItem[];
  analyticsData: AnalyticsData;
  onAnalyticsRangeChange: (value: AnalyticsRange) => void;
  onAnalyticsScopeChange: (value: AnalyticsScope) => void;
  onAnalyticsCategoryChange: (value: string) => void;
  onAnalyticsItemChange: (value: string) => void;
}

export default function AnalyticsTab({
  analyticsRange,
  analyticsScope,
  analyticsCategory,
  analyticsItemId,
  menuItems,
  analyticsData,
  onAnalyticsRangeChange,
  onAnalyticsScopeChange,
  onAnalyticsCategoryChange,
  onAnalyticsItemChange,
}: AnalyticsTabProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Analytics Snapshot</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="ledger-date-presets">
            {(['Today', 'Yesterday', 'This Week', 'This Month'] as const).map(range => (
              <button
                key={range}
                className={`ledger-date-chip${analyticsRange === range ? ' active' : ''}`}
                onClick={() => onAnalyticsRangeChange(range)}
              >
                {range}
              </button>
            ))}
          </div>
          <select
            value={analyticsScope}
            onChange={e => {
              onAnalyticsScopeChange(e.target.value as AnalyticsScope);
              onAnalyticsCategoryChange('All');
              onAnalyticsItemChange('All');
            }}
          >
            <option value="All">All</option>
            <option value="Category">Category</option>
            <option value="Item">Item</option>
          </select>
          {analyticsScope === 'Category' && (
            <select value={analyticsCategory} onChange={e => onAnalyticsCategoryChange(e.target.value)}>
              <option value="All">All</option>
              {Array.from(new Set(menuItems.map(menuItem => menuItem.category))).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          )}
          {analyticsScope === 'Item' && (
            <select value={analyticsItemId} onChange={e => onAnalyticsItemChange(e.target.value)}>
              <option value="All">All</option>
              {menuItems.map(menuItem => (
                <option key={menuItem.id} value={menuItem.id}>{menuItem.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="analytics-grid">
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">{formatCurrency(analyticsData.totalSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Number of Orders</div>
          <div className="stat-value">{analyticsData.totalOrders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Dishes</div>
          <div className="stat-value">
            <ol style={{ paddingLeft: 16, margin: 0 }}>
              {analyticsData.topItems.length === 0 ? <li style={{ listStyle: 'none' }}>—</li> : analyticsData.topItems.map(item => (
                <li key={item.name}>{item.name} · {item.totalQty} pcs</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="chart-card" style={{ gridColumn: '1 / span 2' }}>
          <div className="stat-label">Sales Graph</div>
          <WeeklyBarChart data={analyticsData.chartData} />
        </div>

        <div className="chart-card">
          <div className="stat-label">Category Contribution</div>
          <div className="chart-body">
            {analyticsData.pieData.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={analyticsData.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={4}>
                    {analyticsData.pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}