import { PieChart, Pie, Sector, Tooltip, ResponsiveContainer, Legend } from 'recharts';import type { PaymentSplit } from '../../types';

const COLORS: Record<string, string> = {
  Cash:  '#10b981',
  Card:  '#3b82f6',
  UPI:   '#8b5cf6',
  Other: '#64748b',
};

export default function PaymentPieChart({ data }: { data: PaymentSplit[] }) {
  if (data.length === 0) {
    return <div className="empty-state" style={{ padding: 40 }}><p>No data yet</p></div>;
  }
  
  const pieData = data.map(d => ({ name: d.method, value: d.total, count: d.count }));

  return (
    <div className="chart-body">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie 
            data={pieData} 
            dataKey="value" 
            nameKey="name"
            cx="50%" 
            cy="50%" 
            innerRadius={55} 
            outerRadius={85}
            paddingAngle={3}
            // Replace Cell mapping with the shape prop
            shape={(props: any) => (
              <Sector {...props} fill={COLORS[props.name] ?? '#94a3b8'} />
            )}
          />
          {/* <Pie data={pieData} dataKey="value" nameKey="name"
            cx="50%" cy="50%" innerRadius={55} outerRadius={85}
            paddingAngle={3}
          >
            {pieData.map(entry => (
              <Cell key={entry.name} fill={COLORS[entry.name] ?? '#94a3b8'} />
            ))}
          </Pie> */}
          <Tooltip
            formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']}
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
