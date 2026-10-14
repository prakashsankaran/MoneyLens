import { GenIcon, type IconType } from 'react-icons';
import { featureIconStroke, featureIcons, type FeatureIconName } from '@moneylens/ui';

/** The brand kit's line icons as react-icons components, drawn in the current text colour. */
function featureIcon(name: FeatureIconName): IconType {
  return GenIcon({
    tag: 'svg',
    attr: {
      viewBox: '0 0 100 100',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: String(featureIconStroke),
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    child: featureIcons[name].map((shape) => ({ ...shape, child: [] })),
  });
}

export const BrandTransactionsIcon = featureIcon('transactions');
export const BrandBudgetsIcon = featureIcon('budgets');
export const BrandGoalsIcon = featureIcon('goals');
export const BrandReportsIcon = featureIcon('reports');
export const BrandInsightsIcon = featureIcon('insights');
export const BrandAccountsIcon = featureIcon('accounts');
export const BrandSettingsIcon = featureIcon('settings');
export const BrandSecurityIcon = featureIcon('security');
