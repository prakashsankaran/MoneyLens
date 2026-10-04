/**
 * Built-in category tree, seeded as shared system categories (userId = null).
 * Users can add their own categories alongside these (Phase 2).
 */
export interface SystemCategory {
  slug: string;
  name: string;
  icon: string;
  children: { slug: string; name: string }[];
}

export const SYSTEM_CATEGORIES: SystemCategory[] = [
  {
    slug: 'food',
    name: 'Food',
    icon: 'utensils',
    children: [
      { slug: 'restaurants', name: 'Restaurants' },
      { slug: 'food-delivery', name: 'Food Delivery' },
      { slug: 'coffee', name: 'Coffee' },
      { slug: 'snacks', name: 'Snacks' },
      { slug: 'groceries', name: 'Groceries' },
    ],
  },
  {
    slug: 'shopping',
    name: 'Shopping',
    icon: 'shopping-bag',
    children: [
      { slug: 'online-shopping', name: 'Online Shopping' },
      { slug: 'electronics', name: 'Electronics' },
      { slug: 'clothing', name: 'Clothing' },
      { slug: 'household', name: 'Household' },
    ],
  },
  {
    slug: 'transport',
    name: 'Transport',
    icon: 'car',
    children: [
      { slug: 'fuel', name: 'Fuel' },
      { slug: 'cab', name: 'Cab' },
      { slug: 'public-transport', name: 'Public Transport' },
      { slug: 'parking', name: 'Parking' },
    ],
  },
  {
    slug: 'housing',
    name: 'Housing',
    icon: 'home',
    children: [
      { slug: 'rent', name: 'Rent' },
      { slug: 'maintenance', name: 'Maintenance' },
    ],
  },
  {
    slug: 'bills',
    name: 'Bills',
    icon: 'receipt',
    children: [
      { slug: 'electricity', name: 'Electricity' },
      { slug: 'water', name: 'Water' },
      { slug: 'internet', name: 'Internet' },
      { slug: 'mobile', name: 'Mobile' },
    ],
  },
  {
    slug: 'financial',
    name: 'Financial',
    icon: 'landmark',
    children: [
      { slug: 'emi', name: 'EMI' },
      { slug: 'insurance', name: 'Insurance' },
      { slug: 'investment', name: 'Investment' },
      { slug: 'sip', name: 'SIP' },
      { slug: 'savings', name: 'Savings' },
    ],
  },
  {
    slug: 'healthcare',
    name: 'Healthcare',
    icon: 'heart-pulse',
    children: [
      { slug: 'medicine', name: 'Medicine' },
      { slug: 'hospital', name: 'Hospital' },
      { slug: 'diagnostics', name: 'Diagnostics' },
    ],
  },
  {
    slug: 'entertainment',
    name: 'Entertainment',
    icon: 'clapperboard',
    children: [
      { slug: 'ott', name: 'OTT' },
      { slug: 'movies', name: 'Movies' },
      { slug: 'games', name: 'Games' },
      { slug: 'events', name: 'Events' },
    ],
  },
  {
    slug: 'transfers',
    name: 'Transfers',
    icon: 'arrow-left-right',
    children: [
      { slug: 'self-transfer', name: 'Self Transfer' },
      { slug: 'family-transfer', name: 'Family Transfer' },
    ],
  },
  {
    slug: 'income',
    name: 'Income',
    icon: 'wallet',
    children: [
      { slug: 'salary', name: 'Salary' },
      { slug: 'interest', name: 'Interest' },
      { slug: 'other-income', name: 'Other Income' },
    ],
  },
  {
    slug: 'other',
    name: 'Other',
    icon: 'circle-dashed',
    children: [{ slug: 'uncategorized', name: 'Uncategorized' }],
  },
];
