import { isOwnIncomeStream, salaryIncomeName } from './onboarding';

/**
 * Income streams that may be a business the person runs, offered on My
 * businesses to make one in a tap: "be energy should appear in the list of
 * my businesses ... i thought be energy should auto populate itself" (15 Oct
 * 2026) - named at onboarding before it kept more than one business, it was
 * left an income stream. Never made a business without the tap: an income
 * stream is not a business unless the person says so (8 Oct 2026).
 *
 * Left out: streams already a business, the person's own money (a salary,
 * family support) and a business's salary stream ("Ujenzi Distributors salary").
 */
export function businessSuggestions(
  streams: ReadonlyArray<{ id: number; name: string }>,
  businesses: ReadonlyArray<{ id: number; name: string }>,
): Array<{ id: number; name: string }> {
  const businessIds = new Set(businesses.map((business) => business.id));
  const salaries = new Set(businesses.map((business) => salaryIncomeName(business.name).toLowerCase()));
  const seen = new Set<number>();
  return streams.filter((stream) => {
    if (seen.has(stream.id)) return false;
    seen.add(stream.id);
    const name = stream.name.trim();
    return name !== ''
      && !businessIds.has(stream.id)
      && !isOwnIncomeStream(name)
      && !/\bsalary\b|\bsalaries\b|\bwages?\b/i.test(name)
      && !salaries.has(name.toLowerCase());
  });
}
