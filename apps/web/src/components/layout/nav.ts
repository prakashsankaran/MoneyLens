import {
  ArrowLeftRight,
  ChartColumn,
  FileUp,
  House,
  Lightbulb,
  type LucideIcon,
  Settings,
  Sparkles,
  Target,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Short label for the mobile bottom bar. */
  shortLabel?: string;
  /** Shown in the mobile bottom bar; everything else lives under "More". */
  mobilePrimary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: House, mobilePrimary: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, mobilePrimary: true },
  { to: '/analytics', label: 'Analytics', icon: ChartColumn },
  { to: '/plan', label: 'Money Plan', shortLabel: 'Plan', icon: Target, mobilePrimary: true },
  { to: '/insights', label: 'Insights', icon: Lightbulb, mobilePrimary: true },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/imports', label: 'Imports', icon: FileUp },
  { to: '/settings', label: 'Settings', icon: Settings },
];
