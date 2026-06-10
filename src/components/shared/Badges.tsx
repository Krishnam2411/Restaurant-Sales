import type { ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';
import type { PaymentMethod } from '../../types';

const BADGE: Record<PaymentMethod, string> = {
  Cash: 'badge-cash',
  UPI:  'badge-upi',
  Both: 'badge-both',
  Unpaid: 'badge-both',
  Split: 'badge-both',
  Cancelled: 'badge-cancelled',
};
const ICON: Record<PaymentMethod, IconName> = {
  Cash: 'cash',
  UPI:  'phone',
  Both: 'card',
  Unpaid: 'receipt',
  Split: 'receipt',
  Cancelled: 'cancel',
};

export function PaymentBadge({ method }: { method: PaymentMethod }) {
  return (
    <span className={`badge ${BADGE[method]}`}>
      <Icon name={ICON[method]} size={14} className="badge-icon" />
      {method}
    </span>
  );
}

interface EmptyStateProps {
  icon: IconName;
  message: string;
  action?: ReactNode;
}
export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon name={icon} size={28} /></div>
      <p>{message}</p>
      {action}
    </div>
  );
}
