export function normalizeIncomeSourceName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

export function dedupeIncomeSources<T extends { userId: string; name: string; isMain: boolean; id: number }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.userId}:${normalizeIncomeSourceName(row.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
