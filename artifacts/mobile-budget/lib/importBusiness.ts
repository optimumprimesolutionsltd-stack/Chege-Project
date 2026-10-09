/**
 * "Who is this for?" on an M-Pesa import line: you, or one of your businesses.
 *
 * "How can we get the business model working here?" (9 Oct 2026, on the
 * import screen). Bank asks it of a saved entry (components/WhoIsThisFor);
 * the import asks it of each line before saving, so a business's payments
 * and sales are filed as the business's from the start instead of under
 * "Not sure yet" and moved on Bank later.
 *
 * Nothing new is saved for it: a business is one of My businesses (an income
 * stream), money out for it goes under one of its costs (a category linked to
 * it), and money in for it is its sales (that income stream). The server keeps
 * both out of personal income and spending already. So a line's business is
 * read back from its category or income source - another category or source
 * picked later moves it with them - and `businessId` on the choice only
 * holds a business chosen for a payment while it has no cost yet.
 */
import { chooseCategory, chooseIncomeSource, type Choice, type PreviewLine } from './mpesaImport';

/** The category name -> the business it is a cost of, for My businesses only. */
export function costOwners(
  categories: ReadonlyArray<{ name: string; reducesIncomeSourceId?: number | null }>,
  businessIds: ReadonlySet<number>,
): Map<string, number> {
  const owners = new Map<string, number>();
  for (const row of categories) {
    const owner = row.reducesIncomeSourceId == null ? NaN : Number(row.reducesIncomeSourceId);
    if (businessIds.has(owner)) owners.set(row.name, owner);
  }
  return owners;
}

/** A business's costs, by name. */
export const costsOf = (owners: ReadonlyMap<string, number>, businessId: number | null): string[] =>
  businessId === null ? [] : [...owners.entries()].filter(([, owner]) => owner === businessId).map(([name]) => name).sort((a, b) => a.localeCompare(b));

/** Which business a line is for, or null for Personal. */
export function businessOfLine(
  line: Pick<PreviewLine, 'direction'>,
  choice: Choice | undefined,
  owners: ReadonlyMap<string, number>,
  businessIds: ReadonlySet<number>,
): number | null {
  if (!choice) return null;
  if (line.direction === 'out') {
    // Its cost says which business; a business chosen with no cost yet waits on `businessId`.
    const owner = owners.get(choice.category);
    if (owner !== undefined) return owner;
    return !choice.category.trim() && choice.businessId != null ? choice.businessId : null;
  }
  return choice.incomeSourceId != null && businessIds.has(choice.incomeSourceId) ? choice.incomeSourceId : null;
}

/**
 * The person answers "Who is this for?" on a line. Money out for a business
 * takes one of its costs (the one it has, else the first; none until one is
 * added); money in for a business is its sales. Personal takes back a
 * business's cost or sales the line had. The payee's other lines follow, as a
 * category or source chosen by hand already makes them.
 */
export function chooseBusiness(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  index: number,
  businessId: number | null,
  owners: ReadonlyMap<string, number>,
  businessIds: ReadonlySet<number>,
): Record<number, Choice> {
  const line = lines.find((one) => one.index === index);
  const current = choices[index];
  if (!line || !current) return choices;
  if (line.direction === 'out') {
    if (businessId === null) {
      // A business's cost is no personal category: one is chosen for it instead.
      const wasBusiness = owners.has(current.category);
      return { ...choices, [index]: { ...current, businessId: null, ...(wasBusiness ? { category: '', auto: false, remember: false } : {}) } };
    }
    const costs = costsOf(owners, businessId);
    const category = costs.includes(current.category) ? current.category : costs[0] ?? '';
    const next = category ? chooseCategory(lines, choices, index, category) : { ...choices, [index]: { ...current, category: '', auto: false } };
    return { ...next, [index]: { ...next[index], businessId } };
  }
  if (businessId === null) {
    const wasBusiness = current.incomeSourceId != null && businessIds.has(current.incomeSourceId);
    const next = wasBusiness ? chooseIncomeSource(lines, choices, index, null) : { ...choices };
    return { ...next, [index]: { ...next[index], businessId: null } };
  }
  const next = chooseIncomeSource(lines, choices, index, businessId);
  return { ...next, [index]: { ...next[index], businessId, remember: current.remember ?? true } };
}

/** A cost just added for the line's business: used on it, and on the payee's other lines. */
export function chooseNewCost(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  index: number,
  name: string,
): Record<number, Choice> {
  const businessId = choices[index]?.businessId;
  const next = chooseCategory(lines, choices, index, name);
  return businessId === undefined ? next : { ...next, [index]: { ...next[index], businessId } };
}

export type BusinessPayee = {
  description: string;
  direction: 'in' | 'out';
  business: number;
  /** Money out: the business's cost it was filed under. */
  category: string;
  /** What the person called the payee on the line, if anything. */
  name?: string;
};

/**
 * After Save: the saved lines said to be a business's, to remember the payee
 * for it - a payment as a named account under the cost, money in as the
 * business's sales (payee rules "src:"). Only lines the person left
 * "Remember" ticked on, as with categories.
 */
export function businessPayees(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  saved: ReadonlySet<number>,
  owners: ReadonlyMap<string, number>,
  businessIds: ReadonlySet<number>,
): BusinessPayee[] {
  const found: BusinessPayee[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const choice = choices[line.index];
    if (!saved.has(line.index) || !choice?.include || !choice.remember || !line.description || !line.direction) continue;
    if (choice.otherBudget || choice.transferTo || choice.savingsGoalId || choice.contributorId || choice.debt) continue;
    const business = businessOfLine(line, choice, owners, businessIds);
    if (business === null) continue;
    if (line.direction === 'out' && !owners.has(choice.category)) continue;
    const key = `${line.direction}:${line.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      description: line.description,
      direction: line.direction,
      business,
      category: line.direction === 'out' ? choice.category : '',
      ...(choice.payeeName?.trim() ? { name: choice.payeeName.trim() } : {}),
    });
  }
  return found;
}
