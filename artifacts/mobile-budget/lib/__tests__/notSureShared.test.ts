import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Should also apply to shared budget too" (8 Oct 2026).
describe('Not sure in a Shared group', () => {
  const gather = readFileSync('../api-server/src/lib/entries-to-sort.ts', 'utf8');
  const screen = readFileSync('app/sort-entries.tsx', 'utf8');
  const web = readFileSync('../family-budget/src/pages/sort-entries.tsx', 'utf8');

  it('gathers only imported money in from people, banks and agents, not contributions', () => {
    expect(gather).toContain('const sharedOnly = shared ? fromPeopleBanksAgents : sql``;');
    expect(gather).toContain('const fromPeopleBanksAgents = sql`AND t."mpesa_receipt" IS NOT NULL');
  });

  it("puts a picked stream under its owner, and Undo puts the depositor back", () => {
    expect(screen).toContain('const sourceChange = (source: { id: number; userId?: string | null }) => ({ incomeSourceId: source.id, ...(source.userId ? { madeById: source.userId } : {}) });');
    expect(screen).toContain("...(one.madeById !== undefined ? { madeById: one.madeById } : {})");
    expect(web).toContain('madeById: incomeSources.find((source) => source.id === Number(value))!.userId');
  });
});
