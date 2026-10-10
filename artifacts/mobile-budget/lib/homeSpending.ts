import { isNotSure } from './entriesToSort';

/**
 * At home or outside: a way of reading a month's spending, in Reports only.
 *
 * "In my option, i can tell what i spend at home and what i spend outside ...
 * the logic of for example utilities having subcategories should still be
 * there. but my option should only count in reports" (10 Oct 2026). So the
 * categories stay exactly as they are; each one simply falls on a side -
 * Household upkeep (at home) or outside the home - and Reports adds the sides
 * up. "Education is part of home", and so is health.
 *
 * The side is decided per subcategory, so Food can be split: Groceries at
 * home, Eating out outside. A side the person chose (api-server
 * lib/category-places) wins over the one given here by name.
 */

const norm = (name: string) => name.trim().toLowerCase();

/** Categories whose every subcategory is spent at home, unless moved. */
const HOME_CATEGORIES = new Set([
  'housing', 'utilities', 'household', 'education', 'health', 'books & supplies', 'shared bills', 'household upkeep',
].map(norm));

/** Subcategories (or categories of their own) spent at home wherever they sit. */
const HOME_ITEMS = new Set([
  // Housing
  'rent', 'mortgage', 'service charge', 'repairs',
  // Food bought for the home, not eaten out
  'groceries', 'market shopping', 'supermarket', 'milk & bread', 'food shopping',
  // Utilities and the house itself
  'electricity', 'water', 'cooking gas', 'gas', 'garbage', 'garbage collection', 'security', 'wi-fi', 'home internet', 'pay tv',
  'cleaning supplies', 'house repairs', 'house help', 'nanny salary', 'water & electricity',
  // Education
  'school fees', 'uniform', 'uniforms', 'school trips', 'tuition', 'clubs', 'books', 'stationery', 'books & stationery',
  // Health ("health is part of home")
  'hospital & clinic', 'clinic visits', 'medicine', 'sha contributions', 'medical cover',
].map(norm));

export function defaultAtHome(category: string, parentName?: string | null): boolean {
  if (HOME_ITEMS.has(norm(category)) || HOME_CATEGORIES.has(norm(category))) return true;
  return parentName != null && HOME_CATEGORIES.has(norm(parentName));
}

export type BreakdownRow = {
  category: string;
  spentAmount: number;
  parentName?: string | null;
  isBusinessCost?: boolean;
};

export type SideItem = { category: string; parentName: string | null; spent: number; atHome: boolean; chosen: boolean };
export type HomeVsOutside = {
  home: { total: number; items: SideItem[] };
  outside: { total: number; items: SideItem[] };
  /** Home's share of the two, 0-100. */
  homePercent: number;
};

/**
 * The month's spending on each side. Each subcategory counts on its own side;
 * a category with subcategories counts only what was filed under it directly
 * (its figure in the breakdown already includes its subcategories). A
 * business's costs are the business's, and money not yet sorted is on
 * neither side.
 */
export function homeVsOutside(rows: readonly BreakdownRow[], chosen: ReadonlyMap<string, boolean>): HomeVsOutside {
  const household = rows.filter((row) => !row.isBusinessCost && !isNotSure(row.category) && norm(row.category) !== 'uncategorized');
  const childrenSpent = new Map<string, number>();
  for (const row of household) {
    if (row.parentName) childrenSpent.set(row.parentName, (childrenSpent.get(row.parentName) ?? 0) + (Number(row.spentAmount) || 0));
  }
  const items: SideItem[] = [];
  for (const row of household) {
    const isParent = childrenSpent.has(row.category);
    const spent = (Number(row.spentAmount) || 0) - (isParent ? childrenSpent.get(row.category) ?? 0 : 0);
    if (spent <= 0) continue;
    const choice = chosen.get(row.category);
    items.push({
      category: row.category,
      parentName: row.parentName ?? null,
      spent,
      atHome: choice ?? defaultAtHome(row.category, row.parentName),
      chosen: choice !== undefined,
    });
  }
  items.sort((a, b) => b.spent - a.spent);
  const home = items.filter((item) => item.atHome);
  const outside = items.filter((item) => !item.atHome);
  const sum = (list: SideItem[]) => list.reduce((total, item) => total + item.spent, 0);
  const homeTotal = sum(home);
  const outsideTotal = sum(outside);
  const all = homeTotal + outsideTotal;
  return {
    home: { total: homeTotal, items: home },
    outside: { total: outsideTotal, items: outside },
    homePercent: all > 0 ? Math.round((homeTotal / all) * 100) : 0,
  };
}
