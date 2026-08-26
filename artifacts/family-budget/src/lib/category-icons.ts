import {
  Baby,
  BookOpen,
  BusFront,
  Clapperboard,
  HeartPulse,
  Home,
  MoreHorizontal,
  Phone,
  PiggyBank,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Tag,
  Utensils,
  WalletCards,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICON_RULES: { terms: string[]; icon: LucideIcon }[] = [
  { terms: ["food", "meal", "grocery"], icon: Utensils },
  { terms: ["transport", "fare", "fuel", "travel"], icon: BusFront },
  { terms: ["health", "medical", "clinic", "hospital"], icon: HeartPulse },
  { terms: ["school", "education", "tuition", "uniform", "book"], icon: BookOpen },
  { terms: ["water", "electric", "utility", "power"], icon: Zap },
  { terms: ["entertainment", "movie", "streaming"], icon: Clapperboard },
  { terms: ["clothes", "clothing", "fashion"], icon: Shirt },
  { terms: ["saving", "investment"], icon: PiggyBank },
  { terms: ["rent", "housing", "home"], icon: Home },
  { terms: ["wifi", "internet", "data"], icon: Wifi },
  { terms: ["phone", "communication", "airtime"], icon: Phone },
  { terms: ["insurance"], icon: ShieldCheck },
  { terms: ["nanny", "childcare", "baby"], icon: Baby },
  { terms: ["grooming", "salon", "barber"], icon: Scissors },
  { terms: ["pocket money", "allowance"], icon: WalletCards },
  { terms: ["household", "supplies"], icon: ShoppingBasket },
  { terms: ["shopping"], icon: ShoppingCart },
  { terms: ["other", "misc"], icon: MoreHorizontal },
];

export function getCategoryIcon(category: string): LucideIcon {
  const normalized = category.trim().toLocaleLowerCase("en-US");
  return CATEGORY_ICON_RULES.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.icon ?? Tag;
}