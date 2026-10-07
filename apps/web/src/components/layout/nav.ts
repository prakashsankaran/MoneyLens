import {
  LuArrowLeftRight,
  LuChartColumn,
  LuFileText,
  LuFileUp,
  LuHouse,
  LuLightbulb,
  LuSettings,
  LuSparkles,
  LuTarget,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
export interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Short label for the mobile bottom bar. */
  shortLabel?: string;
  /** Shown in the mobile bottom bar; everything else lives under "More". */
  mobilePrimary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: LuHouse, mobilePrimary: true },
  { to: '/transactions', label: 'Transactions', icon: LuArrowLeftRight, mobilePrimary: true },
  { to: '/analytics', label: 'Analytics', icon: LuChartColumn },
  { to: '/plan', label: 'Money Plan', shortLabel: 'Plan', icon: LuTarget, mobilePrimary: true },
  { to: '/insights', label: 'Insights', icon: LuLightbulb, mobilePrimary: true },
  { to: '/reports', label: 'Monthly report', shortLabel: 'Report', icon: LuFileText },
  { to: '/assistant', label: 'AI Assistant', icon: LuSparkles },
  { to: '/imports', label: 'Imports', icon: LuFileUp },
  { to: '/settings', label: 'Settings', icon: LuSettings },
];
