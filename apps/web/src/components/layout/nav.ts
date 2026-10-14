import { LuFileUp, LuHouse, LuSparkles } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import {
  BrandBudgetsIcon,
  BrandGoalsIcon,
  BrandInsightsIcon,
  BrandReportsIcon,
  BrandSettingsIcon,
  BrandTransactionsIcon,
} from '../BrandIcons';
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
  { to: '/transactions', label: 'Transactions', icon: BrandTransactionsIcon, mobilePrimary: true },
  { to: '/analytics', label: 'Analytics', icon: BrandBudgetsIcon },
  {
    to: '/plan',
    label: 'Money Plan',
    shortLabel: 'Plan',
    icon: BrandGoalsIcon,
    mobilePrimary: true,
  },
  { to: '/insights', label: 'Insights', icon: BrandInsightsIcon, mobilePrimary: true },
  { to: '/reports', label: 'Monthly report', shortLabel: 'Report', icon: BrandReportsIcon },
  { to: '/assistant', label: 'AI Assistant', icon: LuSparkles },
  { to: '/imports', label: 'Imports', icon: LuFileUp },
  { to: '/settings', label: 'Settings', icon: BrandSettingsIcon },
];
