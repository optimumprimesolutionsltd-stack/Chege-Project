import { Feather } from '@expo/vector-icons';

const CATEGORY_ICON_RULES: { terms: string[]; icon: keyof typeof Feather.glyphMap }[] = [
  { terms: ['food', 'meal', 'grocery'], icon: 'shopping-cart' },
  { terms: ['transport', 'fare', 'fuel', 'travel'], icon: 'truck' },
  { terms: ['health', 'medical', 'clinic', 'hospital'], icon: 'heart' },
  { terms: ['school', 'education', 'tuition', 'uniform', 'book'], icon: 'book-open' },
  { terms: ['water', 'electric', 'utility', 'power'], icon: 'zap' },
  { terms: ['entertainment', 'movie', 'streaming'], icon: 'tv' },
  { terms: ['clothes', 'clothing', 'fashion'], icon: 'tag' },
  { terms: ['saving', 'investment'], icon: 'archive' },
  { terms: ['rent', 'housing', 'home'], icon: 'home' },
  { terms: ['wifi', 'internet', 'data'], icon: 'wifi' },
  { terms: ['phone', 'communication', 'airtime'], icon: 'phone' },
  { terms: ['insurance'], icon: 'shield' },
  { terms: ['nanny', 'childcare', 'baby'], icon: 'users' },
  { terms: ['grooming', 'salon', 'barber'], icon: 'scissors' },
  { terms: ['pocket money', 'allowance'], icon: 'dollar-sign' },
  { terms: ['household', 'supplies'], icon: 'box' },
  { terms: ['other', 'misc'], icon: 'more-horizontal' },
];

export function getCategoryIcon(category: string): keyof typeof Feather.glyphMap {
  const normalized = category.trim().toLocaleLowerCase('en-US');
  return CATEGORY_ICON_RULES.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.icon ?? 'tag';
}