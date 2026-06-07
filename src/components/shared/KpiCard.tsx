
import Icon from './Icon';
import type { IconName } from './Icon';

interface KpiCardProps {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  variant: 'gold' | 'green' | 'brown' | 'teal';
}

export default function KpiCard({ icon, label, value, sub, variant }: KpiCardProps) {
  return (
    <div className={`kpi-card kpi-${variant}`}>
      <div className="kpi-icon-wrap">
        <Icon name={icon} size={20} />
      </div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}
