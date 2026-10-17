import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { earnsLabel, earnsOf, earnsWord, salesChipLabel, salesRowHeading } from '../businessEarns';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ujenzi = { id: 1, name: 'Ujenzi', earnsFrom: 'sales' as const };
const dahanak = { id: 2, name: 'Dahanak ventures', earnsFrom: 'rent' as const };

// "why not change the name from dahanak sales to rental income and make that
// logic available in the app" (17 Oct 2026).
describe('a business that earns from rent', () => {
  it('says rental income where a business says sales', () => {
    expect(earnsWord(dahanak)).toBe('rental income');
    expect(earnsLabel(dahanak)).toBe('Rental income');
    expect(earnsOf('Dahanak ventures', dahanak)).toBe("Dahanak ventures's rental income");
    expect(earnsWord(ujenzi)).toBe('sales');
    expect(earnsWord({ name: 'Old, never asked' })).toBe('sales');
  });

  it('heads Money in by what the businesses earn from', () => {
    expect(salesRowHeading([ujenzi])).toBe('BUSINESS SALES FOR');
    expect(salesRowHeading([dahanak])).toBe('RENTAL INCOME FOR');
    expect(salesRowHeading([ujenzi, dahanak])).toBe('SALES OR RENTAL INCOME FOR');
    expect(salesChipLabel(dahanak, [ujenzi, dahanak])).toBe('Dahanak ventures · rent');
    expect(salesChipLabel(dahanak, [dahanak])).toBe('Dahanak ventures');
  });

  it('is chosen in My businesses and used on Money and the Business report', () => {
    const screen = read('app/businesses.tsx');
    expect(screen).toContain('What does it earn from?');
    expect(screen).toContain('testID={`business-earns-from-${business.id}-${answer.earnsFrom}`}');
    expect(read('hooks/useBusinesses.ts')).toContain("body: JSON.stringify({ business: true, earnsFrom }),");
    const bank = read('app/(tabs)/bank.tsx');
    expect(bank).toContain('{salesRowHeading(whoForBusinesses)}');
    expect(bank).toContain('`${businessNameOf(forBusinessId)} - its ${earnsWord(businessEarner(forBusinessId))}`');
    expect(read('app/business.tsx')).toContain('row(earnsLabel(earnerOf(business.incomeSourceId)), business.sales)');
  });
});
