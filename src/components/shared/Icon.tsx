import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Download,
  Hand,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Phone,
  ReceiptIndianRupee,
  ReceiptText,
  Search,
  Settings,
  Soup,
  ShoppingCart,
  Tag,
  Trash2,
  Trophy,
  CreditCard,
  List,
  ChartColumn,
  Square,
  ChevronDown,
  Printer,
  CircleX,
  Filter,
} from 'lucide-react';

type IconName =
  | 'money'
  | 'calendar'
  | 'cart'
  | 'month'
  | 'chart'
  | 'list'
  | 'card'
  | 'trophy'
  | 'bowl'
  | 'receipt'
  | 'receipt-text'
  | 'search'
  | 'trash'
  | 'edit'
  | 'cash'
  | 'phone'
  | 'download'
  | 'settings'
  | 'tag'
  | 'hand'
  | 'down'
  | 'panel-left-close'
  | 'panel-left-open'
  | 'printer'
  | 'cancel'
  | 'filter';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

const ICONS: Record<IconName, LucideIcon> = {
  money: CircleDollarSign,
  calendar: CalendarDays,
  cart: ShoppingCart,
  month: CalendarDays,
  chart: ChartColumn,
  list: List,
  card: CreditCard,
  trophy: Trophy,
  bowl: Soup,
  receipt: ReceiptIndianRupee,
  'receipt-text': ReceiptText, 
  search: Search,
  trash: Trash2,
  edit: PencilLine,
  cash: Banknote,
  phone: Phone,
  download: Download,
  settings: Settings,
  tag: Tag,
  hand: Hand,
  down: ChevronDown,
  'panel-left-close': PanelLeftClose,
  'panel-left-open': PanelLeftOpen,
  printer: Printer,
  cancel: CircleX,
  filter: Filter,
};

const FALLBACK_ICON = Square;

export type { IconName };

export default function Icon({ name, size = 18, className }: IconProps) {
  const LucideIconComponent = ICONS[name] ?? FALLBACK_ICON;

  return <LucideIconComponent className={className} size={size} strokeWidth={2.4} aria-hidden="true" />;
}
