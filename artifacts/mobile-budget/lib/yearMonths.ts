/**
 * Sort them out's months: January to December of one year, every month shown
 * with how many entries it holds, so the row is the same every time - "can we
 * have months jan - dec" (8 Oct 2026). Every year's money in now joins the
 * list, so the years the entries span are offered too.
 */
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function yearsOf(entries: readonly { date: string | null }[], thisYear: number): number[] {
  const years = new Set<number>([thisYear]);
  for (const entry of entries) {
    const year = Number(entry.date?.slice(0, 4));
    if (Number.isInteger(year) && year > 1900) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

export function monthsOfYear(entries: readonly { date: string | null }[], year: number): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.date?.slice(0, 7);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return SHORT.map((label, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { key, label, count: counts.get(key) ?? 0 };
  });
}
