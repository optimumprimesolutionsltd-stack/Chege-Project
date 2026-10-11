import { isOwnIncomeStream, salaryIncomeName } from './onboarding';
import type { PayeeRules } from './payeeLearning';

/**
 * Budgets set up before onboarding asked "which business earns this?" can
 * have two streams for one source of money - "Rental income" and the business
 * that collects the rent. Each such stream is asked about once: combined into
 * the business (api-server lib/combine-income-sources), or kept as money paid
 * to the person ("fix the individual businesses problem", 11 Oct 2026).
 */
export type Stream = { id: number; name: string };

export const ownIncomeKey = (groupId: number | string | undefined): string => `jamvi:own-income:${groupId ?? 'none'}`;

/** The next stream to ask about, or null: not a business, not plainly the person's own, not a business's salary, not answered. */
export function streamToAsk(sources: readonly Stream[], businesses: readonly Stream[], answered: readonly number[]): Stream | null {
  if (businesses.length === 0) return null;
  const businessIds = new Set(businesses.map((business) => business.id));
  const salaries = new Set(businesses.map((business) => salaryIncomeName(business.name).toLowerCase()));
  const kept = new Set(answered);
  return sources.find((source) =>
    !businessIds.has(source.id) &&
    !kept.has(source.id) &&
    !isOwnIncomeStream(source.name) &&
    !salaries.has(source.name.trim().toLowerCase())) ?? null;
}

/** The payers remembered for a combined stream now point at the business (the server does the same to its copy). */
export function withSourceMoved(rules: PayeeRules, fromId: number, intoId: number): PayeeRules {
  const next: PayeeRules = { ...rules };
  for (const [key, value] of Object.entries(rules)) {
    if (key.startsWith('src:') && value === String(fromId)) next[key] = String(intoId);
  }
  return next;
}
